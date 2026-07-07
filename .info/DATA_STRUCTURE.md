# Arquitectura de Datos — Theatres App

> Guía de referencia rápida sobre cómo fluyen los datos y dónde modificarlos.

## 1. La Jerarquía (4 Niveles)

La app está estructurada para ser predecible y evitar que datos falsos contaminen el proyecto del usuario. Sigue este modelo:

### Nivel 1: App Config (`js/data/app.config.json`)
- **Propósito**: Valores duros que definen límites y comportamientos a nivel sistema.
- **Qué contiene**: Background color de la escena, tamaño del gizmo, versión de localStorage, grid inicial.
- **¿Es modificable?**: Solo por desarrolladores. Se carga una vez al arranque.

### Nivel 2: Catálogos / Datasets (`js/data/catalogs/`)
- **Propósito**: Definir QUÉ cosas existen en el universo de la aplicación.
- **Qué contiene**:
  - `theatres.catalog.js`: Teatros reales (medidas de la caja, barras).
  - `scenography.catalog.js`: Volúmenes primitivos (cubos, esferas) y utilería futura.
  - `system.catalog.js`: Escenotecnia (varas, luces, telones).
  - `personas.catalog.js`: Punteros a los modelos `.glb` en la carpeta `assets/`.
- **¿Es modificable?**: Sí (por devs para agregar contenido). **NO por el usuario en tiempo de ejecución.**

### Nivel 3: Proyecto del Usuario (`ProjectManager.js` -> `localStorage`)
- **Propósito**: Guardar lo que el usuario ha HECHO con los catálogos.
- **Qué contiene**: El teatro seleccionado + Las instancias 3D (posición, rotación, color, escala).
- **Flujo**:
  1. El usuario elige un teatro (Catalogo) -> Pasa al Proyecto (`theatre.catalogId`).
  2. El usuario añade un Cubo (Catalogo) -> Pasa al Proyecto como una Instancia en `scene.meshInstances`.

### Nivel 4: Overrides
- **Propósito**: ¿Qué pasa si el usuario edita el ancho del "Teatro Tecal"?
- **Flujo**: El original en el catálogo (`theatres.catalog.js`) NUNCA se toca. La modificación se guarda en `userProject.theatre.overrides`. El renderizador fusiona ambos al vuelo.

---

## 2. Reglas de Oro

1. **El Render manda, el Árbol obedece**: 
   Nunca guardes el HTML (`innerHTML`) del panel lateral en localStorage. El árbol (TreeBuilder) debe generarse dinámicamente a partir del arreglo de instancias 3D (`meshInstances`).
2. **Las Personas y Assets son asíncronos**:
   Usa siempre `PersonasEngine.createPersona()` para generar instancias; el engine se encarga de descargar el GLB y conectarle el esqueleto (alometría).
3. **No uses `constants.js` para datos de la app**:
   Si necesitas una medida "por defecto" para el escenario, usa `DEFAULT_CONTAINER` de `theatres.catalog.js`. Si necesitas un color global, debe estar en `app.config.json`.

---

## 3. ¿Cómo Extender?

### ¿Quieres agregar un nuevo Teatro?
Edita `js/data/catalogs/theatres.catalog.js` y agrégalo al array `THEATRES_CATALOG`. Mágicamente aparecerá en el dropdown y el renderizador 3D lo construirá basándose en las propiedades `stage`.

### ¿Quieres agregar un nuevo elemento al menú de (+) en Escena?
Edita `js/data/catalogs/scenography.catalog.js`. Define si es un volumen simple (geoType) o un modelo futuro (asset).

### ¿Quieres agregar una nueva Animación de Persona?
1. Copia el archivo `.glb` a `assets/modelos3d/personas/animaciones/`.
2. Agrégalo al array en `assets/modelos3d/personas/animaciones/index.json`. No necesitas tocar código JS.
