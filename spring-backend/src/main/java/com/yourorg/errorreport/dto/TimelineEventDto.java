package com.yourorg.errorreport.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record TimelineEventDto(
        @NotBlank String id,
        int seq,
        @NotBlank String timestamp,
        @NotBlank String type,
        @NotNull Object payload
) {

    public record HttpEventDto(
            @NotBlank String correlationId,
            @NotBlank String phase,
            @NotBlank String method,
            @NotBlank String url,
            Object requestHeaders,
            Object requestBody,
            Integer status,
            Object responseHeaders,
            Object responseBody,
            Long durationMs,
            ErrorDetail error,
            Boolean truncated
    ) {
        public record ErrorDetail(String message, String name) {}
    }

    public record ClickEventDto(
            @NotBlank String selector,
            @NotBlank String elementTag,
            String elementText,
            String dataTestId,
            @NotBlank String routeUrl
    ) {}

    public record NavigationEventDto(
            @NotBlank String from,
            @NotBlank String to
    ) {}

    public record ErrorEventDto(
            @NotBlank String message,
            String stack,
            @NotBlank String source
    ) {}
}
