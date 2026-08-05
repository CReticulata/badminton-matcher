<script setup lang="ts">
import { computed } from 'vue'
import { textColorOn } from '../lib/color'

const props = defineProps<{ name: string; color: string; small?: boolean }>()
const textColor = computed(() => textColorOn(props.color))
</script>

<template>
  <span
    class="inline-flex items-center rounded-full font-medium"
    :class="small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'"
    :style="{ backgroundColor: color, color: textColor }"
  >
    {{ name }}
  </span>
</template>
