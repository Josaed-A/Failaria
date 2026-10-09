# Mantenimiento, supervisión de grietas y predicción de falla

Fundamentos que usa la plataforma (vistas Alertas, Equipo y Simulador) y límites del modelo.
Público: estudiantes y mantenedores. Lectura en 10 minutos; cada sección cierra con **lo que hace la plataforma**.

## 1. Cómo se supervisa una grieta en una pala

| Etapa | Práctica habitual en estructuras soldadas de equipo minero | En la plataforma |
|---|---|---|
| Dónde mirar | Zonas de concentración de tensiones: talones de soldadura del pie y nariz del boom, orejas del brazo, orejas y labio del cucharón, montajes de cilindros | Los 12 puntos de la hoja *Puntos*, ubicados en los esquemas y en el 3D |
| Cómo detectar | Visual + líquidos penetrantes (PT) o partículas magnéticas (MT); ultrasonido (UT) para profundidad | Longitud L en mm por inspección; fotos por punto |
| Cuándo | Frecuencia fija (p. ej. cada 500–1000 h) que se acorta cuando la grieta se acerca al límite | Intervalo típico calculado del historial (≈ 750 h) y alerta de proximidad |
| Qué decidir | **Caution**: aumentar frecuencia y programar reparación. **Danger**: detener y reparar | Estado Normal / Alerta / Crítico con los umbrales del Excel |
| Cómo reparar | Esmerilar hasta eliminar la grieta (verificar con MT/PT), soldar con procedimiento calificado, precalentar, a veces reforzar con planchas; registrar y volver a inspeccionar pronto | Una reparación reinicia el ciclo; la reincidencia se cuenta como indicador de calidad de reparación |
| Qué registrar | Fecha, horómetro, inspector, longitud, foto, comentario; nunca confundir «no inspeccionado» con «sin grieta» | Formulario con la estructura del formato Word; vacío = N/I; datos sospechosos marcados |

Referencias de práctica: guías de inspección estructural de palas hidráulicas y de NDT en equipo minero
([HVI: hydraulic shovel inspection](https://heavyvehicleinspection.com/industries/mining/hydraulic-mining-shovel-excavator-inspection-maintenance),
[HVI: structural crack inspection and NDT](https://heavyvehicleinspection.com/industries/mining/mining-equipment-structural-crack-inspection-ndt)).

## 2. Por qué la grieta acelera: ley de Paris

En fatiga, la grieta crece por ciclo de carga según la **ley de Paris**:

```
da/dN = C · ΔK^m        ΔK = Y · Δσ · √(π·a)
```

* `a` longitud de grieta, `N` ciclos, `C` y `m` constantes del material (aceros soldados: `m ≈ 2,5–3,5`).
* `ΔK` es el rango del factor de intensidad de tensiones: crece con la **raíz de la longitud** y con el rango de tensión `Δσ`.

Consecuencias prácticas:

1. Como los ciclos por hora son aproximadamente constantes en una pala, `da/dh ∝ a^(m/2)`: con `m = 3`, **duplicar la longitud multiplica la tasa por 2,8**. La proyección lineal de la vista Punto es optimista cuando la grieta ya es larga.
2. Una **sobrecarga** que aumente `Δσ` en un factor `(1+s)` multiplica la tasa por `(1+s)^m`: un 30 % más de esfuerzo → ×2,2; el doble → ×8.
3. Existe una **longitud crítica** `a_c` en la que `K` alcanza la tenacidad `K_IC` (fractura inestable) o el ligamento que queda no resiste la carga (colapso plástico). A partir de ahí la pieza se pierde.

Las normas de aptitud para el servicio (BS 7910, API 579-1/ASME FFS-1) calculan `a_c` y la vida remanente con estos ingredientes y fijan el intervalo de inspección como una fracción (típicamente 1/2 a 1/3) de las horas que tarda la grieta más grande que podría pasar inadvertida en llegar a `a_c`
([resumen de método y factores de seguridad](https://nxtbook.com/nxtbooks/gulfpub/h2tech_q3_2022/index.php?startid=33),
[ejemplo BS 7910 de placa con defecto](https://www.excelcalcs.com/repository/strength/fatigue/assessment-of-flaw-in-centre-of-a-plate-in-tension/)).

**Lo que hace la plataforma (src/falla.js).** No conoce `C`, `Y` ni `Δσ`, así que calibra la ley con lo que sí mide el inspector:

* tasa observada `v₀` (mm/1000 h) en el ciclo actual del punto (o su mediana histórica);
* **régimen de grieta corta:** por debajo de `a_ref = max(L, Caution/2)` la tasa se mantiene en `v₀` (tensiones residuales de soldadura y reparación dominan);
* desde `a_ref`, `v(a) = v₀ · (a/a_ref)^(m/2)`, con solución cerrada en horas;
* `a_c = 1,6 × Danger` (parámetro `falla.factorCritico` en `src/config.js`), porque Danger es el límite operativo del formato y no la fractura.

## 3. Cómo falla: diagrama de evaluación de falla (FAD)

El FAD combina los dos mecanismos en un solo gráfico: `K_r = K/K_IC` (fractura frágil, eje vertical) y `L_r = σ_ref/σ_y` (colapso plástico, eje horizontal). Dentro de la curva la grieta es tolerable; al cruzarla la pieza falla por el mecanismo del eje dominante
([introducción al FAD](https://inspectioneering.com/journal/2020-12-29/9465/ffs-forum-using-fracture-mechanics-to-lower-risk-and-improve-plant-reliability-)).

**Lo que hace la plataforma.** Usa la curva Opción 1 de BS 7910, `f(L_r) = (1 − 0,14·L_r²)·(0,3 + 0,7·e^(−0,65·L_r⁶))` con corte en `L_r,max = 1,15`, y
`K_r = (1+s)·√(a/a_c)` y `L_r = L_r,nominal·(1+s)/(1 − 0,5·a/a_c)` (el ligamento se reduce al crecer la grieta). El simulador dibuja los 12 puntos y dice si domina **fractura** o **colapso**.

## 4. Modos y causas de falla que muestra el simulador

Además del modo (etapa de la grieta), al fallar un punto el simulador clasifica la **causa**: *fatiga por horas de uso* (llegó a `a_c` con carga normal), *fatiga acelerada por sobrecargas* (más de la mitad del crecimiento ocurrió sobrecargado) o *fractura por fuerza excesiva* (un sobreesfuerzo hizo cruzar el FAD de inmediato). El reporte de esfuerzo acumula por punto las horas sobrecargadas, el sobreesfuerzo medio y máximo y la «dosis» de daño adicional.

| Modo | Condición | Qué significa en terreno | Acción |
|---|---|---|---|
| Sin grieta | L = 0 | Punto sano; solo una sobrecarga importante inicia una grieta | Seguimiento |
| Iniciación (etapa I) | 0 < L < Caution | Grieta corta en el talón de soldadura, crecimiento lento | Frecuencia normal |
| Propagación estable (etapa II) | Caution ≤ L < Danger | Crecimiento según Paris; la tasa ya sube con √a | Programar reparación, acortar intervalo |
| Propagación acelerada (etapa III) | Danger ≤ L < a_c | Ligamento reducido; cualquier sobrecarga puede fracturar | Detener y reparar |
| Fractura / colapso | L ≥ a_c | Pérdida del componente | — |

## 5. Planificar y programar el mantenimiento

La detección no sirve sin ejecución. La vista **Plan** convierte las recomendaciones en tareas con fecha, responsable y lista de pasos, y las lleva por un tablero (Por planificar → Programada → En ejecución → Hecha) y un calendario.

| Origen | Tarea sugerida | Fecha propuesta |
|---|---|---|
| Próxima parada recomendada | Parada de reparación con un paso por punto a intervenir | Fecha de la parada (un intervalo antes de Danger) |
| Punto en Crítico | Reparar antes de operar | Hoy |
| Punto en Alerta | Programar reparación por soldadura (esmerilar, verificar MT/PT, soldar con procedimiento calificado, NDT posterior, registrar L = 0) | Plazo del plan priorizado |
| Proximidad a Caution o crecimiento rápido | Inspección adicional del punto | La fecha más cercana entre el plazo y la próxima inspección |
| Dato sospechoso en la última inspección | Re-medir y confirmar | Hoy |
| N/I en la última inspección | Inspeccionar (acceso / limpieza) | Próxima inspección |
| Fotos desactualizadas | Registro fotográfico de la zona | Próxima inspección |
| Siempre | Inspección periódica de los 12 puntos | Última inspección + intervalo típico |

Cerrar una tarea de reparación debe terminar en **Registrar** con L = 0 y el comentario «Zona reparada por soldadura»: así el ciclo se reinicia y la plataforma vigila la reincidencia.

## 6. Lo que el simulador NO es

* No es un cálculo FEA: el mapa de color es una **visualización didáctica** del daño (gravedad de cada grieta y sobreesfuerzo aplicado), no tensiones calculadas.
* No conoce el espectro real de carga, el material ni la geometría del detalle: `m`, `a_c`, `L_r,nominal` y el alcance del esfuerzo son parámetros editables en `src/config.js → falla`.
* El sobreesfuerzo del mouse es un experimento «¿y si se sobrecarga aquí?», no una medición.
* La decisión de mantenimiento sigue siendo del ingeniero con las reglas deterministas de `src/reglas.js`.
