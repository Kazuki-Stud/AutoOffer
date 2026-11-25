package AutoOffer.configuration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;

import java.time.Duration;
import java.util.Map;

@Configuration
public class CacheConfig {

    @Bean
    @ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
    public CacheManager redisCacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration defaults = RedisCacheConfiguration.defaultCacheConfig()
                .disableCachingNullValues()
                .entryTtl(Duration.ofMinutes(10));

        Map<String, RedisCacheConfiguration> perCache = Map.of(
                CacheNames.WHITELIST, defaults.entryTtl(Duration.ofMinutes(10)),
                CacheNames.DICTIONARIES_BOOTSTRAP, defaults.entryTtl(Duration.ofMinutes(30)),
                CacheNames.SELECTORS, defaults.entryTtl(Duration.ofMinutes(5)),
                CacheNames.SKILL_HOTWORDS, defaults.entryTtl(Duration.ofMinutes(10))
        );

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaults)
                .withInitialCacheConfigurations(perCache)
                .build();
    }

    @Bean
    @ConditionalOnMissingBean(CacheManager.class)
    public CacheManager fallbackCacheManager() {
        return new ConcurrentMapCacheManager(
                CacheNames.WHITELIST,
                CacheNames.DICTIONARIES_BOOTSTRAP,
                CacheNames.SELECTORS,
                CacheNames.SKILL_HOTWORDS
        );
    }
}
