package com.yourorg.errorreport.controller;

import com.yourorg.errorreport.dto.ErrorReportDto;
import com.yourorg.errorreport.dto.ErrorReportResponse;
import com.yourorg.errorreport.service.ErrorReportStorageService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/error-reports")
public class ErrorReportController {

    private final ErrorReportStorageService storageService;

    public ErrorReportController(ErrorReportStorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ErrorReportResponse> submitReport(
            @Valid @RequestBody ErrorReportDto report,
            @AuthenticationPrincipal UserDetails principal
    ) {
        String storedAt = storageService.store(report, principal.getUsername());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(new ErrorReportResponse(report.reportId(), storedAt));
    }

    @GetMapping("/{reportId}")
    @PreAuthorize("hasRole('DEVELOPER') or hasRole('ADMIN')")
    public ResponseEntity<String> getReport(@PathVariable String reportId) {
        return storageService.retrieve(reportId)
                .map(json -> ResponseEntity
                        .ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(json))
                .orElse(ResponseEntity.notFound().build());
    }
}
