import { onMounted, onUnmounted, reactive } from 'vue';

const deviceState = reactive({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    deviceType: 'desktop',
    orientation: 'landscape',
    aspectRatio: '16:10',
    isTouch: false,
    keyboardOpen: false,
});

function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

function formatAspect(w, h) {
    if (!w || !h) return '16:9';
    const ratio = w / h;
    if (Math.abs(ratio - 21 / 9) < 0.15) return '21:9';
    if (Math.abs(ratio - 16 / 9) < 0.12) return '16:9';
    if (Math.abs(ratio - 9 / 16) < 0.08) return '9:16';
    if (Math.abs(ratio - 9 / 21) < 0.08) return '9:21';
    const rw = Math.round(w / 10);
    const rh = Math.round(h / 10);
    const div = gcd(rw, rh) || 1;
    return `${Math.round(rw / div)}:${Math.round(rh / div)}`;
}

function classifyDevice(width) {
    if (width <= 340) return 'foldable';
    if (width <= 680) return 'mobile';
    if (width <= 1024) return 'tablet';
    if (width >= 1920) return 'ultrawide';
    return 'desktop';
}

export function updateDeviceSnapshot() {
    if (typeof window === 'undefined') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const vvHeight = window.visualViewport?.height ?? h;
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const deviceType = classifyDevice(w);
    const orientation = w >= h ? 'landscape' : 'portrait';
    const keyboardOpen = isTouch && vvHeight < h * 0.75;

    deviceState.width = w;
    deviceState.height = h;
    deviceState.pixelRatio = Number((window.devicePixelRatio || 1).toFixed(2));
    deviceState.deviceType = deviceType;
    deviceState.orientation = orientation;
    deviceState.aspectRatio = formatAspect(w, h);
    deviceState.isTouch = isTouch;
    deviceState.keyboardOpen = keyboardOpen;

    const root = document.documentElement;
    root.setAttribute('data-device', deviceType);
    root.setAttribute('data-orientation', orientation);
    root.setAttribute('data-touch', isTouch ? 'true' : 'false');
    root.classList.toggle('ao-keyboard-open', keyboardOpen);
}

function onFocusIn(e) {
    const tag = e.target?.tagName;
    if (!deviceState.isTouch && window.innerWidth > 768) return;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        setTimeout(() => {
            e.target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        }, 120);
    }
}

let refCount = 0;

export function useDeviceInfo() {
    onMounted(() => {
        if (refCount === 0 && typeof window !== 'undefined') {
            updateDeviceSnapshot();
            window.addEventListener('resize', updateDeviceSnapshot);
            window.addEventListener('orientationchange', updateDeviceSnapshot);
            window.visualViewport?.addEventListener('resize', updateDeviceSnapshot);
            document.addEventListener('focusin', onFocusIn);
        }
        refCount++;
    });

    onUnmounted(() => {
        refCount = Math.max(0, refCount - 1);
        if (refCount === 0 && typeof window !== 'undefined') {
            window.removeEventListener('resize', updateDeviceSnapshot);
            window.removeEventListener('orientationchange', updateDeviceSnapshot);
            window.visualViewport?.removeEventListener('resize', updateDeviceSnapshot);
            document.removeEventListener('focusin', onFocusIn);
        }
    });

    return { deviceState, updateDeviceSnapshot };
}
