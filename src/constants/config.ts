/**
 * Configuración de red de la app.
 *
 * - GRAPHQL_URL: endpoint GraphQL del API Gateway.
 * La aplicación móvil solo conoce la URL pública del API Gateway. Las URLs y
 * credenciales de los microservicios son responsabilidad del gateway.
 *
 * ── Cómo cambiar entre desarrollo y producción ──────────────────────────────
 * Prioridad de selección del entorno:
 *   1. Variable de entorno  EXPO_PUBLIC_APP_ENV=production|development
 *      → p.ej.  EXPO_PUBLIC_APP_ENV=production npx expo start
 *      (también se inyecta por perfil de build en eas.json).
 *   2. La constante FORCE_ENV de abajo (cámbiala a mano para fijar un entorno).
 *   3. 'auto' (default): usa __DEV__ → dev server = development,
 *      build de release = production.
 *
 * Dev (LAN): para dispositivo físico usar la IP de la PC en la red local (misma
 * Wi-Fi). Emulador Android: 10.0.2.2 · Simulador iOS: localhost.
 *
 * El API Gateway centraliza el acceso al Core y a los demás microservicios.
 */

// type AppEnv = 'development' | 'production';
type AppEnv = 'development' | 'production';
// Fija un entorno a mano ('development' | 'production') o deja 'auto'.
// Forzado a 'production' para repartir el APK a compañeros: garantiza que
// apunte a los microservicios desplegados (EC2 / Cloud Run) sin depender del
// perfil de build ni de __DEV__. Volver a 'auto' para desarrollo local.
const FORCE_ENV: AppEnv | 'auto' = 'production';


function resolveEnv(): AppEnv {
  const fromVar = process.env.EXPO_PUBLIC_APP_ENV;
  if (fromVar === 'development' || fromVar === 'production') return fromVar;
  if (FORCE_ENV !== 'auto') return FORCE_ENV;
  return __DEV__ ? 'development' : 'production';
}

export const APP_ENV: AppEnv = resolveEnv();

// IP de la PC servidora en la red local (dev: API Gateway e IA en la misma máquina).
const LAN_HOST = '192.168.1.148';

const ENVIRONMENTS: Record<AppEnv, { API_BASE_URL: string }> = {
  development: {
    API_BASE_URL: `http://${LAN_HOST}:4000`,
  },
  production: {
    API_BASE_URL: 'https://api.vitalbite.com',
  },
};

const active = ENVIRONMENTS[APP_ENV];

export const API_BASE_URL = active.API_BASE_URL;
export const GRAPHQL_URL = `${API_BASE_URL}/graphql`;
export const IA_FOOD_SCAN_URL = `${API_BASE_URL}/api/v1/ia/food-scan`;
export const IA_HEALTH_URL = `${API_BASE_URL}/api/v1/ia/health`;

// Tamaño máximo de imagen aceptado por el backend de IA (5 MB).
export const IA_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// ─── Agendamiento de citas vía WhatsApp ────────────────────────────────────────
// Número de la recepción/consultorio al que el paciente puede escribir para
// coordinar una cita manualmente como alternativa al agendamiento in-app.
// `WHATSAPP_BOOKING_NUMBER` se usa para mostrar; `WHATSAPP_BOOKING_E164` (solo
// dígitos, con código de país) es el que arma el enlace https://wa.me/.
export const WHATSAPP_BOOKING_NUMBER = '+1 (555) 151-2577';
export const WHATSAPP_BOOKING_E164 = '15551512577';
