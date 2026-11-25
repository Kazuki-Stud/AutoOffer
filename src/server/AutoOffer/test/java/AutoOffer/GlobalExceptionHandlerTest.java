package AutoOffer;

import AutoOffer.exception.ErrorCode;
import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.RecoverableDataAccessException;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void handleValidation_returnsFieldErrorsAnd400() throws Exception {
        var target = new Object();
        var binding = new BeanPropertyBindingResult(target, "req");
        binding.addError(new FieldError("req", "url", "Must be http(s) URL"));
        var method = this.getClass().getDeclaredMethod("handleValidation_returnsFieldErrorsAnd400");
        var param = new org.springframework.core.MethodParameter(method, -1);
        MethodArgumentNotValidException ex = new MethodArgumentNotValidException(param, binding);

        ResponseEntity<ErrorResponseBody> res = handler.handleValidation(ex);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().code()).isEqualTo(ErrorCode.VALIDATION_ERROR);
        assertThat(res.getBody().details()).containsEntry("url", "Must be http(s) URL");
    }

    @Test
    void handleBadRequest_returns400() {
        var ex = new HttpMessageNotReadableException("bad json", mock(HttpInputMessage.class));
        ResponseEntity<ErrorResponseBody> res = handler.handleBadRequest(ex);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(res.getBody().code()).isEqualTo(ErrorCode.VALIDATION_ERROR);
    }

    @Test
    void handleResponseStatus_maps401_403_404_409_400_500() {
        assertThat(handler.handleResponseStatus(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "bad")).getBody().code())
                .isEqualTo(ErrorCode.UNAUTHORIZED);
        assertThat(handler.handleResponseStatus(new ResponseStatusException(HttpStatus.FORBIDDEN, "no")).getBody().code())
                .isEqualTo(ErrorCode.FORBIDDEN);
        assertThat(handler.handleResponseStatus(new ResponseStatusException(HttpStatus.NOT_FOUND, "missing")).getBody().code())
                .isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        assertThat(handler.handleResponseStatus(new ResponseStatusException(HttpStatus.CONFLICT, "dup")).getBody().code())
                .isEqualTo(ErrorCode.CONFLICT);
        assertThat(handler.handleResponseStatus(new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad")).getBody().code())
                .isEqualTo(ErrorCode.VALIDATION_ERROR);
        assertThat(handler.handleResponseStatus(new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)).getBody().code())
                .isEqualTo(ErrorCode.INTERNAL_ERROR);
    }

    @Test
    void handleAccessDenied_returns403() {
        var res = handler.handleAccessDenied(new AccessDeniedException("denied"));
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(res.getBody().code()).isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void handleDatabaseError_mapsSqlStates() {
        DataAccessException conflict = new RecoverableDataAccessException("dup", new SQLException("dup", "23505"));
        assertThat(handler.handleDatabaseError(conflict).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

        DataAccessException check = new RecoverableDataAccessException("chk", new SQLException("chk", "23514"));
        assertThat(handler.handleDatabaseError(check).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        DataAccessException priv = new RecoverableDataAccessException("priv", new SQLException("priv", "42501"));
        assertThat(handler.handleDatabaseError(priv).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        DataAccessException notFound = new RecoverableDataAccessException("nf", new SQLException("nf", "P0002"));
        assertThat(handler.handleDatabaseError(notFound).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        DataAccessException generic = new RecoverableDataAccessException("generic", new RuntimeException("io"));
        assertThat(handler.handleDatabaseError(generic).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void handleHttpProtocolErrors_returns404_405_406() {
        var notSupported = handler.handleMethodNotSupported(
            new HttpRequestMethodNotSupportedException("DELETE"));
        assertThat(notSupported.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(notSupported.getBody().code()).isEqualTo(ErrorCode.VALIDATION_ERROR);

        var notAcceptable = handler.handleNotAcceptable(
            new HttpMediaTypeNotAcceptableException("text/xml"));
        assertThat(notAcceptable.getStatusCode()).isEqualTo(HttpStatus.NOT_ACCEPTABLE);

        var noResource = handler.handleNoResourceFound(mock(NoResourceFoundException.class));
        assertThat(noResource.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(noResource.getBody().code()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
    }

    @Test
    void handleOther_returns500() {
        var res = handler.handleOther(new IllegalStateException("boom"));
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(res.getBody().code()).isEqualTo(ErrorCode.INTERNAL_ERROR);
    }
}
