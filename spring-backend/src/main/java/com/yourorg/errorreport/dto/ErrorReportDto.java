package com.yourorg.errorreport.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ErrorReportDto(
        @NotBlank String reportId,
        @NotBlank String createdAt,
        @NotNull @Valid AppInfo app,
        @NotNull @Valid SessionInfo session,
        @NotNull @Valid TriggeringError triggeringError,
        @NotBlank String initialRoute,
        @NotNull @Size(max = 500) List<@Valid TimelineEventDto> timeline,
        String userComment
) {

    public record AppInfo(
            @NotBlank String name,
            @NotBlank String version,
            @NotBlank String environment
    ) {}

    public record SessionInfo(
            @NotBlank String sessionId,
            String userId,
            @NotBlank String userAgent,
            @NotNull Viewport viewport
    ) {
        public record Viewport(int w, int h) {}
    }

    public record TriggeringError(
            @NotBlank String message,
            String stack,
            @NotBlank String source
    ) {}
}
