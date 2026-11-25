package AutoOffer.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

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

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HandlerMethodValidationException.class
    })
    public ResponseEntity<ErrorResponseBody> handleBadRequest(Exception ex) {
        return ResponseEntity.badRequest()
        .body(ErrorResponseBody.of(400, ErrorCode.VALIDATION_ERROR, "Malformed or invalid request parameter"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponseBody> handleResponseStatus(ResponseStatusException ex) {
        int status = ex.getStatusCode().value();
        ErrorCode code = switch (status) {
            case 401 -> ErrorCode.UNAUTHORIZED;
            case 403 -> ErrorCode.FORBIDDEN;
            case 404 -> ErrorCode.RESOURCE_NOT_FOUND;
            case 409 -> ErrorCode.CONFLICT;
            default -> status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_ERROR;
        };
        String message = ex.getReason() != null ? ex.getReason() : ex.getMessage();
        return ResponseEntity.status(status).body(ErrorResponseBody.of(status, code, message));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponseBody> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(ErrorResponseBody.of(403, ErrorCode.FORBIDDEN, "Access denied"));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ErrorResponseBody> handleDatabaseError(DataAccessException ex) {
        Throwable root = ex.getMostSpecificCause();
        if (root instanceof SQLException sqlEx) {
            String state = sqlEx.getSQLState();
            if ("23505".equals(state)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponseBody.of(409, ErrorCode.CONFLICT, "Duplicate record violates unique constraint"));
            }
            if ("23514".equals(state) || "23503".equals(state) || "23502".equals(state)) {
                return ResponseEntity.badRequest()
                .body(ErrorResponseBody.of(400, ErrorCode.DB_POLICY_VIOLATION, sqlEx.getMessage()));
            }
            if ("42501".equals(state)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ErrorResponseBody.of(403, ErrorCode.FORBIDDEN, "Insufficient database privileges"));
            }
            if ("P0002".equals(state)) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponseBody.of(404, ErrorCode.RESOURCE_NOT_FOUND, "Requested record was not found"));
            }
        }
        log.warn("Database access error", ex);
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