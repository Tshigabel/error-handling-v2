package com.yourorg.errorreport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yourorg.errorreport.dto.ErrorReportDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

@Service
public class ErrorReportStorageService {

    private static final Logger log = LoggerFactory.getLogger(ErrorReportStorageService.class);

    private final S3Client s3Client;
    private final ObjectMapper objectMapper;
    private final String bucketName;

    public ErrorReportStorageService(
            S3Client s3Client,
            ObjectMapper objectMapper,
            @Value("${error-report.s3.bucket}") String bucketName
    ) {
        this.s3Client = s3Client;
        this.objectMapper = objectMapper;
        this.bucketName = bucketName;
    }

    public String store(ErrorReportDto report, String authenticatedUser) {
        try {
            String json = objectMapper.writeValueAsString(report);
            String key = buildKey(report);

            String truncatedMessage = report.triggeringError().message();
            if (truncatedMessage.length() > 128) {
                truncatedMessage = truncatedMessage.substring(0, 128);
            }

            PutObjectRequest putRequest = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .contentType("application/json")
                    .serverSideEncryption(ServerSideEncryption.AWS_KMS)
                    .metadata(Map.of(
                            "app-version", report.app().version(),
                            "environment", report.app().environment(),
                            "user-id", hashUserId(authenticatedUser),
                            "triggering-error-message", truncatedMessage
                    ))
                    .build();

            s3Client.putObject(putRequest, RequestBody.fromString(json));

            log.info("Stored error report {} at {}", report.reportId(), key);
            return key;

        } catch (Exception e) {
            log.error("Failed to store error report {}", report.reportId(), e);
            throw new RuntimeException("Failed to store error report", e);
        }
    }

    public Optional<String> retrieve(String reportId) {
        try {
            String prefix = "error-reports/";
            ListObjectsV2Request listRequest = ListObjectsV2Request.builder()
                    .bucket(bucketName)
                    .prefix(prefix)
                    .build();

            // Search across date partitions for the report
            var response = s3Client.listObjectsV2(listRequest);
            Optional<String> matchingKey = response.contents().stream()
                    .map(S3Object::key)
                    .filter(k -> k.endsWith("/" + reportId + ".json"))
                    .findFirst();

            if (matchingKey.isEmpty()) {
                return Optional.empty();
            }

            GetObjectRequest getRequest = GetObjectRequest.builder()
                    .bucket(bucketName)
                    .key(matchingKey.get())
                    .build();

            var objectBytes = s3Client.getObjectAsBytes(getRequest);
            return Optional.of(objectBytes.asUtf8String());

        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (Exception e) {
            log.error("Failed to retrieve error report {}", reportId, e);
            throw new RuntimeException("Failed to retrieve error report", e);
        }
    }

    private String buildKey(ErrorReportDto report) {
        LocalDate now = LocalDate.now();
        return String.format("error-reports/%s/%s/%s/%s/%s.json",
                report.app().environment(),
                now.format(DateTimeFormatter.ofPattern("yyyy")),
                now.format(DateTimeFormatter.ofPattern("MM")),
                now.format(DateTimeFormatter.ofPattern("dd")),
                report.reportId());
    }

    private String hashUserId(String userId) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(userId.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 16);
        } catch (Exception e) {
            return "unknown";
        }
    }
}
