# --- Stage 1: Build ---
FROM gradle:8.14-jdk23-alpine AS builder
WORKDIR /workspace

# 1. Редко меняющийся слой: зависимости (кэшируется Docker)
COPY build.gradle settings.gradle ./
COPY gradle* ./gradle
RUN gradle dependencies --no-daemon

# 2. Часто меняющийся слой: исходники и ресурсы (main/ вместо src/)
COPY main ./main
RUN gradle bootJar --no-daemon -x test \
    && rm -rf /root/.gradle/caches

# --- Stage 2: Runtime ---
FROM eclipse-temurin:23-jre-alpine AS runtime

RUN apk add --no-cache curl \
    && addgroup -S -g 1001 appgroup \
    && adduser -S -u 1001 -G appgroup appuser

WORKDIR /app
COPY --from=builder --chown=1001:1001 /workspace/build/libs/*.jar app.jar

USER 1001:1001
EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseG1GC -Djava.security.egd=file:/dev/urandom"

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8080/actuator/health/readiness || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
