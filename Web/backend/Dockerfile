FROM eclipse-temurin:21-jdk
WORKDIR /work

RUN groupadd -r appgroup && useradd -r -g appgroup appuser

RUN mkdir -p /work/uploads && chown -R appuser:appgroup /work/uploads

COPY target/quarkus-app/ ./quarkus-app/
COPY target/code-with-quarkus-1.0.0-SNAPSHOT.jar .

USER appuser

ENV QUARKUS_HTTP_PORT=1001

CMD ["java", "-Dquarkus.http.host=0.0.0.0", "-Dquarkus.http.port=${QUARKUS_HTTP_PORT}", "-jar", "quarkus-app/quarkus-run.jar"]