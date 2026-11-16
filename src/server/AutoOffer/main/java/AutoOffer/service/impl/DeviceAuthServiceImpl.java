package AutoOffer.service.impl;

import AutoOffer.configuration.SecurityProperties;
import AutoOffer.dto.auth.DeviceRegisterResponse;
import AutoOffer.entity.Device;
import AutoOffer.repository.DeviceRepository;
import AutoOffer.service.DeviceAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DeviceAuthServiceImpl implements DeviceAuthService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private final DeviceRepository deviceRepository;
    private final SecurityProperties securityProperties;

    @Override
    @Transactional
    public DeviceRegisterResponse registerOrRotateToken(UUID pseudonymousId) {
        byte[] rawBytes = new byte[32];
        RANDOM.nextBytes(rawBytes);
        String rawToken = HexFormat.of().formatHex(rawBytes);
        String hash = hmacSha256Hex(rawToken);

        Device device = deviceRepository.findByPseudonymousId(pseudonymousId)
                .map(existing -> {
                    existing.setAuthTokenHash(hash);
                    existing.setLastActiveAt(OffsetDateTime.now());
                    return deviceRepository.save(existing);
                })
                .orElseGet(() -> deviceRepository.save(Device.builder()
                        .pseudonymousId(pseudonymousId)
                        .authTokenHash(hash)
                        .build()));

        return new DeviceRegisterResponse(device.getId(), device.getPseudonymousId(), rawToken);
    }

    @Override
    @Transactional
    public Optional<Device> authenticate(UUID pseudonymousId, String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return Optional.empty();
        String candidateHash = hmacSha256Hex(rawToken);
        return deviceRepository.findByPseudonymousId(pseudonymousId)
                .filter(d -> MessageDigest.isEqual(
                        d.getAuthTokenHash().getBytes(StandardCharsets.UTF_8),
                        candidateHash.getBytes(StandardCharsets.UTF_8)))
                .map(d -> {
                    deviceRepository.touchLastActive(d.getId(), OffsetDateTime.now());
                    return d;
                });
    }

    private String hmacSha256Hex(String token) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(securityProperties.deviceTokenPepper().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA-256 failure", e);
        }
    }
}
