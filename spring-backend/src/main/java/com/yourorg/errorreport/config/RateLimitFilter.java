package com.yourorg.errorreport.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RateLimitFilter implements Filter {

    private static final int MAX_REQUESTS_PER_MINUTE = 10;
    private final Map<String, WindowCounter> counters = new ConcurrentHashMap<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpReq = (HttpServletRequest) request;

        if (!httpReq.getRequestURI().startsWith("/api/error-reports") ||
                !"POST".equalsIgnoreCase(httpReq.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String key = resolveKey(httpReq);
        WindowCounter counter = counters.computeIfAbsent(key, k -> new WindowCounter());

        if (!counter.tryAcquire()) {
            HttpServletResponse httpResp = (HttpServletResponse) response;
            httpResp.setStatus(429);
            httpResp.getWriter().write("{\"error\":\"Rate limit exceeded. Try again later.\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    private String resolveKey(HttpServletRequest request) {
        String sessionId = request.getHeader("X-Session-Id");
        if (sessionId != null && !sessionId.isBlank()) {
            return "session:" + sessionId;
        }
        String user = request.getRemoteUser();
        if (user != null) {
            return "user:" + user;
        }
        return "ip:" + request.getRemoteAddr();
    }

    private static class WindowCounter {
        private long windowStart = System.currentTimeMillis();
        private final AtomicInteger count = new AtomicInteger(0);

        synchronized boolean tryAcquire() {
            long now = System.currentTimeMillis();
            if (now - windowStart > 60_000) {
                windowStart = now;
                count.set(0);
            }
            return count.incrementAndGet() <= MAX_REQUESTS_PER_MINUTE;
        }
    }
}
