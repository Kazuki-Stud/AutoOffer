package AutoOffer.etl;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class ClickHouseClient {

    private final RestClient restClient;
    private final ClickHouseProperties props;
    private final ObjectMapper objectMapper;

    public ClickHouseClient(ClickHouseProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder()
                .baseUrl(props.url())
                .defaultHeader("X-ClickHouse-User", props.username())
                .defaultHeader("X-ClickHouse-Key", props.password())
                .build();
    }

    public <T> void insertJsonEachRow(String table, List<T> rows) {
        if (rows.isEmpty()) return;
        String ndjson = rows.stream()
                .map(objectMapper::writeValueAsString)
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
}