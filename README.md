# Planificador VMC (GitHub Pages)

Sistema web independiente para planificar la reunión de entre semana (Vida y Ministerio Cristiano).

## Qué hace
- Pegás el link semanal de WOL y el sistema intenta detectar las partes.
- Sugiere asignados con rotación “pareja” usando historial.
- Permite edición manual (títulos, reemplazos, etc.).
- Guarda en Firestore.
- Genera tablero tipo “S-140” y exporta PNG para WhatsApp + opción imprimir.

## Pasos rápidos
1) Crear proyecto en Firebase
   - Authentication: Email/Password (crear un usuario)
   - Firestore: crear base de datos

2) Pegar `firebaseConfig` en `Configuración` (settings.html)

3) Login

4) Cargar Personas (sexo/rol/aprobados)

5) Semana → pegar link WOL → Cargar → Sugerir → Guardar

## Firestore (reglas sugeridas)
Estas son reglas básicas para que SOLO usuarios logueados puedan leer/escribir:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> Luego podés endurecerlo por roles si querés.

## Proxy (si falla WOL)
Por defecto usa `https://r.jina.ai/http://...` (evita CORS).
Si un día falla, podés crear un proxy (Cloudflare Worker) y ponerlo en Configuración:

Ejemplo (worker):
- `https://TU-WORKER.workers.dev/?url=`
