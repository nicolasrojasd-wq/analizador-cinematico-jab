# Analizador Cinemático del JAB

Aplicación web desarrollada para la asignatura **Análisis Bioinstrumental del Movimiento Humano** de Kinesiología.

El proyecto permite realizar un **análisis cinemático 2D de un golpe JAB de boxeo** mediante visión por computador, identificando hombro, codo y muñeca para calcular variables asociadas a la extensión del codo.

## Acceso rápido

### Aplicación web
https://nicolasrojasd-wq.github.io/analizador-cinematico-jab/

### Código fuente
https://github.com/nicolasrojasd-wq/analizador-cinematico-jab

## Objetivo

Desarrollar una interfaz web que permita analizar cinemáticamente un golpe JAB de boxeo mediante visión por computador, identificando automáticamente puntos anatómicos del miembro superior para calcular variables relacionadas con la extensión del codo.

## Gesto analizado

**Guardia → Extensión → Máxima extensión → Retorno a guardia**

La aplicación está diseñada principalmente para analizar **un JAB por video**.

## Landmarks utilizados

MediaPipe Pose Landmarker detecta la pose corporal. Para el análisis del brazo se utilizan:

### Brazo derecho
- Hombro: 12
- Codo: 14
- Muñeca: 16

### Brazo izquierdo
- Hombro: 11
- Codo: 13
- Muñeca: 15

## Cálculo del ángulo del codo

Se forman dos vectores con vértice en el codo:

```text
v1 = hombro - codo
v2 = muñeca - codo
```

Luego:

```text
θ = arccos[(v1 · v2) / (|v1| |v2|)]
```

El resultado se expresa en grados.

## Variables analizadas

- Ángulo inicial del codo
- Máxima extensión
- Rango angular observado
- Tiempo hasta máxima extensión
- Velocidad angular máxima
- Velocidad angular media de extensión
- Tiempo de retorno a guardia
- Cantidad de cuadros válidos
- Trayectoria 2D de la muñeca

### Velocidad angular media de extensión

```text
Velocidad angular media = Rango angular / Tiempo de extensión
```

Unidad:

```text
°/s
```

No corresponde a velocidad lineal del puño en m/s.

## Flujo de procesamiento

```text
VIDEO
↓
LECTURA CUADRO A CUADRO
↓
MEDIAPIPE POSE LANDMARKER
↓
HOMBRO - CODO - MUÑECA
↓
COORDENADAS
↓
CÁLCULO DEL ÁNGULO
↓
DETECCIÓN DE FASES
↓
MÉTRICAS
↓
GRÁFICOS
↓
RESULTADOS
```

## Tecnologías utilizadas

- HTML5
- CSS3
- JavaScript
- MediaPipe Tasks Vision
- Chart.js
- GitHub Pages

## Estructura del proyecto

```text
analizador-cinematico-jab/
├── index.html
├── style.css
├── script.js
├── README.md
└── .nojekyll
```

## Instrucciones de uso

1. Abrir la aplicación desde GitHub Pages.
2. Esperar hasta que aparezca **MediaPipe listo**.
3. Seleccionar **Cargar video**.
4. Elegir un video con un único JAB.
5. Seleccionar el brazo derecho o izquierdo.
6. Presionar **Analizar JAB**.
7. Esperar a que el procesamiento llegue al 100 %.
8. Revisar landmarks, ángulo, fase, resultados y gráfico.
9. Reproducir o mover la barra del video para revisar distintos momentos.
10. Usar **Reiniciar** para analizar otro registro.

## Protocolo recomendado de grabación

- cámara fija;
- buena iluminación;
- fondo con poco ruido visual;
- hombro, codo y muñeca visibles;
- brazo completo dentro del encuadre;
- ropa que permita distinguir el miembro superior;
- grabación de perfil o semiperfil controlado;
- un solo JAB por video;
- evitar oclusiones;
- evitar movimientos de cámara;
- utilizar 60 FPS si el dispositivo lo permite.

Pueden utilizarse cintas o referencias visuales sobre hombro, codo y muñeca para facilitar la comprobación visual de los landmarks.

## Visualización

Durante la reproducción se muestran:

- H: hombro
- C: codo
- M: muñeca
- segmentos del brazo
- arco del ángulo del codo
- valor angular dinámico
- trayectoria de la muñeca
- fase estimada
- tiempo del registro

## Fases del movimiento

```text
Guardia / preparación
Extensión
Máxima extensión
Retorno a guardia
Guardia recuperada
```

## Limitaciones

- análisis principalmente 2D;
- dependencia de la posición de la cámara;
- errores de perspectiva;
- posibles errores de landmarks;
- sensibilidad a oclusiones;
- influencia de iluminación, FPS y calidad de video;
- ausencia de calibración espacial absoluta;
- la trayectoria de muñeca no representa metros;
- no se calcula velocidad lineal absoluta del puño en m/s;
- las fases usan criterios aproximados;
- MediaPipe no reemplaza un sistema 3D de laboratorio;
- la aplicación no entrega diagnóstico;
- la aplicación no determina si un JAB es correcto o incorrecto.

## Requisitos

Para utilizar la versión publicada se requiere:

- navegador web moderno;
- conexión a internet;
- JavaScript habilitado.

El usuario final **no necesita instalar** Python, Node.js, MediaPipe, Chart.js ni Visual Studio Code.

## Uso académico

Proyecto desarrollado con fines académicos para integrar:

- Kinesiología
- Biomecánica
- Análisis cinemático
- Visión por computador
- Programación web

La aplicación no corresponde a un dispositivo médico ni reemplaza sistemas instrumentales de laboratorio.
