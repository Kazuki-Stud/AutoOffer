<template>
    <div class="stats-wrapper">
        <ao-stats>
            <div v-for="stat in stats" :key="stat.label" class="ao-stat-card">
                <div class="ao-stat-num">{{ stat.value }}</div>
                <div class="ao-stat-label">{{ stat.label }}</div>
            </div>
        </ao-stats>
    </div>
</template>

<script setup>
defineProps({
    stats: {
        type: Array,
        default: () => [],
    },
});
</script>
