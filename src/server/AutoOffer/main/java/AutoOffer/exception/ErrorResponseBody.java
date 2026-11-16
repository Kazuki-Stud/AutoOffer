package AutoOffer.exception;

import java.time.OffsetDateTime;
import java.util.Map;

public record ErrorResponseBody(
        OffsetDateTime timestamp,
        int status,
        ErrorCode code,
        String message,
        Map<String, String> details
) {
    public static ErrorResponseBody of(int status, ErrorCode code, String message) {
        return new ErrorResponseBody(OffsetDateTime.now(), status, code, message, Map.of());
    }
}
