# Planificador VMC - build 10217
## Build 10215

- Se reforzó el patrón de sugerencias: la app elige primero a la persona habilitada que más tiempo lleva sin participar.
- El sugeridor evita repetir una misma persona en la misma semana; solo repite automáticamente si no queda ninguna otra persona habilitada disponible.
- Si se detecta una persona repetida en dos asignaciones, muestra alerta y aviso visible.
- Si la repetición fue manual, permite guardar únicamente después de confirmar la advertencia.
- Versión visible de la app: 2.3.13.

Versión limpia con ingreso seguro reforzado para el proyecto Firebase `rvmc-c28b6`.

## Cambios de esta versión

- Se ajustó la impresión del tablero para que salgan exactamente dos semanas por hoja A4 en formato vertical.
- El diseño impreso ahora es más compacto para que Auditorio principal y Sala B entren en el PDF sin pasar a una segunda página.

- Se agregó Sala B / sala auxiliar configurable desde Configuración.
- La lectura bíblica y las asignaciones de Seamos mejores maestros se duplican para Auditorio principal y Sala B.
- El botón Sugerir asignados también completa automáticamente la Sala B usando el mismo sistema de rotación/historial.
- El tablero imprimible muestra claramente Auditorio principal y Sala B.

- Inicio de sesión más claro y adaptado a celular.
- Nadie puede entrar a Inicio, Semana, Personas, Tablero ni Configuración sin iniciar sesión.
- Alta de usuario desde la pantalla de ingreso.
- Recuperación de contraseña por correo.
- Cambio de contraseña desde Configuración > Seguridad de la cuenta.
- Botones para mostrar u ocultar contraseña.
- Reglas de Firestore incluidas: solo usuarios logueados pueden leer o escribir.

## Subir a Firebase Hosting

Desde PowerShell, dentro de la carpeta `vmc-main`:

```powershell
firebase deploy --only hosting -P rvmc-c28b6
```

## Publicar reglas de Firestore

```powershell
firebase deploy --only firestore:rules -P rvmc-c28b6
```

También se pueden pegar manualmente desde Firebase Console > Firestore Database > Rules.


## Build 10204

- El ingreso redirige manualmente después de iniciar sesión.
- Muestra el Project ID usado por la app para evitar confusiones de Firebase.
- Ignora configuraciones locales de otros proyectos y vuelve a `rvmc-c28b6`.
- Muestra errores de Firebase más claros.


## Build 10207

- Agregada opción Configuración > Habilitar Sala B / sala auxiliar.
- Nueva configuración de nombre de la sala auxiliar, por defecto “Sala B”.
- Al cargar el programa o abrir una semana, se generan filas separadas para Auditorio principal y Sala B en lectura bíblica y asignaciones estudiantiles.
- Las semanas viejas se mantienen: las filas existentes quedan como Auditorio principal y se agregan las filas auxiliares al guardar.
- El historial guarda la clave de asignación y la sala para conservar mejor la rotación.


## Build 10208

- Ajuste específico de impresión/PDF: la hoja del tablero se imprime en A4 vertical con dos semanas apiladas por página.
- Se redujeron tamaños y espaciados solo en modo impresión para que las filas adicionales de Sala B no rompan el diseño.
- En pantalla se conserva la vista grande del tablero; el cambio afecta principalmente a Imprimir / Guardar como PDF.


## Build 10210

- Corrección reforzada del guardado de asignados.
- Los asignados ahora se guardan en dos lugares compatibles: en la colección `asignaciones` y también dentro del documento de la semana en `semanas.assignments`.
- Al abrir una semana o el tablero, si la colección separada no devuelve los asignados, la app recupera la copia guardada dentro de la semana.
- Se evita borrar involuntariamente un asignado guardado si la persona ya no aparece en el selector por filtros/permisos.
- No se cambió el sistema de Sala B, WOL, tablero, impresión ni reglas existentes.
- Versión visible de la app: 2.3.7.

## Build 10209

- Corrección del guardado y recuperación de semanas cargadas.
- Las semanas ahora se identifican también por `weekStartISO`, de modo que al elegir cualquier fecha dentro de la misma semana se recuperan los datos ya guardados.
- Se mantiene compatibilidad con semanas/asignaciones guardadas en builds anteriores.
- Al guardar o abrir el tablero se persisten semana, partes, canciones y asignaciones; si ocurre un error de Firebase se muestra en pantalla.
- El tablero toma la fecha de reunión guardada cuando recupera una semana por equivalencia semanal.
- Versión visible de la app: 2.3.5.




## Build 10213

- Corrección de Sala B automática por WOL: la app ya no prueba números vecinos del enlace pegado. Si se pega `202026247`, solo intenta leer esa semana y no salta a `202026248`.
- La detección quedó más estricta: Sala B se activa automáticamente solo si dentro de “Seamos mejores maestros” hay una parte titulada “Discurso” / “Discurso de estudiante”.
- Ya no se activa por la palabra “discurso” en detalles, notas o en otras secciones como “Nuestra vida cristiana”.
- En una semana nueva, Sala B queda desactivada hasta que WOL detecte ese discurso o hasta que el usuario la active manualmente.
- Pruebas incluidas: `202026247` queda desactivada; `202026248` queda activada.
- Versión visible de la app: 2.3.9.

## Build 10212

- Sala B / sala auxiliar ahora puede decidirse por semana desde la pantalla Semana.
- Al cargar el programa desde WOL, si “Seamos mejores maestros” contiene un discurso, la Sala B se activa automáticamente para esa semana.
- Si WOL no detecta un discurso en “Seamos mejores maestros”, la Sala B queda desactivada para esa semana.
- Se conserva el control manual: el usuario puede activar o desactivar Sala B antes de guardar.
- El tablero respeta primero la decisión guardada de la semana para no mostrar Sala B cuando fue desactivada.
- Versión visible de la app: 2.3.8.

## Build 10211
Refuerza el guardado de asignados, agrega aviso de guardado confirmado, compatibilidad con campos antiguos personId/personName y botones para limpiar o eliminar asignados de una semana.


## Build 10217

Build segura basada en 10215: conserva intacta la lógica funcional de Semana/asignaciones (`js/semana.js`) y agrega solo backup compatible Python/Web desde Configuración. Exporta/importa JSON con configuración, personas, roles, semanas y asignaciones guardadas.
