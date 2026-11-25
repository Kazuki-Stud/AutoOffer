# --- Stage 1: Build ---
FROM eclipse-temurin:26-jdk AS builder
WORKDIR /workspace

COPY gradlew settings.gradle build.gradle gradle.properties* ./
COPY gradle ./gradle
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon --no-configuration-cache

COPY main ./main
RUN ./gradlew bootJar --no-daemon --no-configuration-cache -x test \
    && rm -rf /root/.gradle/caches

# --- Stage 2: Runtime ---
FROM eclipse-temurin:26-jre AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup -M -s /usr/sbin/nologin appuser

WORKDIR /app
COPY --from=builder --chown=1001:1001 /workspace/build/libs/*.jar app.jar

USER 1001:1001
EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=70.0 -XX:+UseSerialGC -Xss256k -Djava.security.egd=file:/dev/urandom"

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8080/actuator/health/readiness || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]