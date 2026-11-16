package AutoOffer.etl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class ClickHouseClient {

    private final RestClient restClient;
    private final ClickHouseProperties props;
    private final ObjectMapper objectMapper;

    public ClickHouseClient(
            ObjectProvider<RestClient.Builder> builderProvider,
            ClickHouseProperties props,
            ObjectProvider<ObjectMapper> objectMapperProvider) {
        this.props = props;
        this.objectMapper = objectMapperProvider.getIfAvailable(ObjectMapper::new);
        this.restClient = builderProvider.getIfAvailable(RestClient::builder)
                .baseUrl(props.url())
                .defaultHeader("X-ClickHouse-User", props.username())
                .defaultHeader("X-ClickHouse-Key", props.password())
                .build();
    }

    public <T> void insertJsonEachRow(String table, List<T> rows) {
        if (rows.isEmpty()) return;
        String ndjson = rows.stream()
                .map(this::toJson)
                .collect(Collectors.joining("\n"));

        restClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/")
                        .queryParam("database", props.database())
                        .queryParam("date_time_input_format", "best_effort")
                        .queryParam("query", "INSERT INTO " + props.database() + "." + table + " FORMAT JSONEachRow")
                        .build())
                .contentType(MediaType.APPLICATION_NDJSON)
                .body(ndjson)
                .retrieve()
                .toBodilessEntity();
    }

    public void executeStatement(String sql) {
        restClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/")
                        .queryParam("database", props.database())
                        .build())
                .contentType(MediaType.TEXT_PLAIN)
                .body(sql)
                .retrieve()
                .toBodilessEntity();
    }

    public String queryJson(String sql) {
        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/")
                        .queryParam("database", props.database())
                        .queryParam("query", sql + " FORMAT JSON")
                        .build())
                .retrieve()
                .body(String.class);
    }

    private String toJson(Object row) {
        try {
            return objectMapper.writeValueAsString(row);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize ClickHouse row", e);
        }
    }
}