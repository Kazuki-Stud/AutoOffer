package AutoOffer.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponseBody> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new HashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(e -> fields.put(e.getField(), e.getDefaultMessage()));
        return ResponseEntity.badRequest().body(new ErrorResponseBody(
                OffsetDateTime.now(), 400, ErrorCode.VALIDATION_ERROR, "Request validation failed", fields));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponseBody> handleDbConstraint(DataIntegrityViolationException ex) {
        Throwable root = ex.getMostSpecificCause();
        if (root instanceof SQLException sqlEx) {
            String state = sqlEx.getSQLState();
            if ("23505".equals(state)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(ErrorResponseBody.of(409, ErrorCode.CONFLICT, "Duplicate record violates unique constraint"));
            }
            if ("23514".equals(state) || "23503".equals(state)) {
                return ResponseEntity.badRequest()
                        .body(ErrorResponseBody.of(400, ErrorCode.DB_POLICY_VIOLATION, sqlEx.getMessage()));
            }
            if ("42501".equals(state)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(ErrorResponseBody.of(403, ErrorCode.FORBIDDEN, "Insufficient database privileges"));
            }
        }
        log.warn("DataIntegrityViolationException", ex);
        return ResponseEntity.badRequest()
                .body(ErrorResponseBody.of(400, ErrorCode.DB_POLICY_VIOLATION, "Data integrity violation"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponseBody> handleOther(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponseBody.of(500, ErrorCode.INTERNAL_ERROR, "Internal server error"));
    }
}