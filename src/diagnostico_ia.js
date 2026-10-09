// Diagnóstico IA incluido en la plataforma: respuesta de Claude al prompt que arma la vista IA
// (src/ia.js, construirPrompt) con el Excel original (datos hasta el 11-oct-2025).
// Se muestra en las vistas IA y Reporte mientras el usuario no guarde ni borre un diagnóstico, para que
// la versión entregable no llegue sin diagnóstico (lo guardado vive en el navegador de cada usuario).
// tests/verify.cjs comprueba que sus cifras clave sigan coincidiendo con el análisis; si cambia el Excel, regenerarlo.
export const DIAGNOSTICO_DEFECTO = {
  defecto: true,
  origen: 'Diagnóstico incluido en la plataforma (Claude, prompt de la vista IA)',
  modelo: 'claude-opus-5-5',
  fecha: '2026-10-09T12:00:00.000Z',
  datosHasta: '2025-10-11',
  texto: `## 1. Diagnóstico ejecutivo
El equipo 3600-01 está en **Alerta** por un solo punto: **BR-01**, en las orejas intermedias del cilindro del brazo, mide 410 mm, sobre Caution (300 mm), y crece ≈ 48 mm/1000 h.
Con crecimiento lineal llegaría a Danger (600 mm) en ≈ 3.754 h, hacia el 14-may-2026. La parada de reparación debe hacerse antes de ≈ 3.000 h (01-abr-2026), un intervalo de inspección antes de ese límite.
Los otros 11 puntos están en Normal, pero el boom tiene tres grietas creciendo en paralelo y el cucharón muestra las tasas más altas del equipo.
El historial confirma el riesgo de dejar avanzar una grieta: CU-02 operó 2.219 h en Crítico, hasta 1.040 mm, antes de repararse el 19-jul-2025.

## 2. Prioridades de mantenimiento
| Punto | Acción | Plazo | Justificación |
|---|---|---|---|
| BR-01 | Reparar por soldadura en la parada; inspeccionar con mayor frecuencia hasta entonces | Parada antes de 68.703 h (≈ 01-abr-2026); Danger a 69.457 h (≈ 14-may-2026) | Alerta desde el 22-abr-2025 (2.904 h sobre Caution); 410 mm, 48 mm/1000 h, R² 0,99 |
| BM-01 | Inspección adicional e incluir en la parada | Caution a ≈ 1.224 h (≈ 20-dic-2025) | 200 mm, 41 mm/1000 h; la grieta más avanzada del boom |
| CU-02 | Inspeccionar en el próximo intervalo, revisar la reparación e incluir en la parada | Próxima inspección a ≈ 754 h (≈ 23-nov-2025); Caution a ≈ 3.740 h (≈ 13-may-2026) | Reapareció con 70 mm tras la reparación de jul-2025; la tasa de 88 mm/1000 h sale de solo dos mediciones del ciclo actual (0 y 70 mm) |
| BM-03 · CU-01 · BM-02 | Inspeccionar con END en la parada y reparar si superan Caution | Caution a ≈ 2.422 h (27-feb-2026), ≈ 2.711 h (15-mar-2026) y ≈ 2.814 h (21-mar-2026) | Llegan a Caution antes de la parada; las tres son reincidencias tras reparación |
| BR-04 | Inspeccionar en la próxima oportunidad | Próxima inspección | No inspeccionado el 11-oct-2025; último dato 0 mm (26-ago-2025) |
| CU-03 · CU-04 · BR-03 · BM-04 · BR-02 | Seguimiento en la frecuencia normal | Cada ≈ 754 h | Normal; Caution a más de 5.000 h o sin grieta |

## 3. Patrones y causas probables
**Boom (pluma).** BM-01, BM-02 y BM-03 aparecieron casi a la vez (50–60 mm el 07-mar-2025) y crecen a ritmos parecidos, de 32 a 41 mm/1000 h con R² ≥ 0,98. Un inicio simultáneo en tres zonas apunta a un cambio común de carga u operación a comienzos de 2025, más que a defectos locales. BM-02 y BM-03 reaparecieron ≈ 6.400 h después de la reparación del 01-mar-2024, y BM-04 ya se reparó dos veces.
- Verificar: cambio de material o frente de carguío, ciclos más severos, técnica de operación y procedimiento de las reparaciones de 2024.

**Brazo (stick).** BR-01 concentra la grieta más larga y crece de forma sostenida desde jun-2024, de 70 a 420 mm. BR-03 reapareció en la soldadura de la oreja interna tras su reparación. Ambos patrones son coherentes con fatiga por las cargas del cilindro transmitidas a las orejas.
- Verificar: holguras de pasadores y bujes del cilindro, alineación de las orejas, calidad de la soldadura de oreja y presión de trabajo del cilindro.

**Cucharón.** Es la zona más activa: CU-02 y CU-01 tienen las tasas más altas del equipo, 88 y 63 mm/1000 h, y ambas son reincidencias. CU-01 volvió a 230 mm en ≈ 3.600 h después de repararse.
- Verificar: impacto y abrasión en excavación dura, procedimiento y material de aporte de las reparaciones, y si la grieta se eliminó por completo antes de soldar (END de liberación).

**En todo el equipo.** Hay seis reincidencias en nueve reparaciones. Conviene revisar el procedimiento de reparación por soldadura antes de la próxima parada: WPS, precalentamiento, preparación de junta y END posterior.

## 4. Frecuencia de inspección
- El intervalo actual de ≈ 754 h (≈ 43 días) es suficiente para los puntos en Normal: con las tasas medidas ninguno avanza más de ≈ 66 mm entre dos inspecciones.
- **BR-01:** reducir el intervalo a la mitad, ≈ 377 h (≈ 22 días), hasta repararlo. Crece ≈ 36 mm por intervalo actual y le quedan 190 mm hasta Danger.
- **CU-02 y CU-01:** no superar 754 h y medir con END en cada inspección. Confirmar la tasa de CU-02 con al menos dos mediciones más antes de cambiar el intervalo.
- **BM-01:** inspección adicional antes de llegar a Caution, hacia el 20-dic-2025.
- Supuesto: las proyecciones son lineales. En fatiga la tasa suele aumentar con la longitud de la grieta, así que los plazos de BR-01 y de las grietas más largas pueden ser optimistas.

## 5. Calidad de los datos
- **CU-01, 22-abr-2025: 1.010 mm** entre 0 mm (07-mar-2025) y 100 mm (08-jun-2025). Es probable un dígito extra (101 mm). Está pendiente de decisión; si fuera real, el punto habría estado en Crítico.
- **CU-02, 22-abr-2025: 0 mm** sin registro de reparación, en pleno periodo en Crítico. Lo más probable es que no se inspeccionara y se anotara 0 en vez de dejar la celda vacía.
- **BR-01 y CU-03:** bajaron 10 y 20 mm sin reparación. Se tratan como variación de medición, pero el valor de BR-01 (410 mm) puede subestimar la grieta: conviene re-medir.
- **BR-04:** sin dato en la última inspección. La cobertura total es 97,1 % y los vacíos se mantienen como no inspeccionados, nunca como 0.
- **Registro fotográfico:** las tres zonas tienen fotos desactualizadas. Sin fotos recientes no se puede verificar la ubicación ni la longitud de las grietas activas. Fotografiar con regla cada punto con grieta en cada inspección.
- **Vigencia:** el historial termina el 11-oct-2025 y las fechas se estiman con 17,4 h/día. Si el equipo siguió operando sin nuevas inspecciones, la parada recomendada (01-abr-2026) y el límite de BR-01 (14-may-2026) ya pasaron. Hay que confirmar el estado actual antes de usar este plan.

## 6. Preguntas para el equipo de terreno
1. ¿Se reparó BR-01 o se hizo la parada después del 11-oct-2025? ¿Cuánto mide hoy?
2. CU-01 el 22-abr-2025: ¿el valor real fue 101 mm o 1.010 mm? CU-02 ese mismo día: ¿se inspeccionó?
3. ¿Por qué no se inspeccionó BR-04 el 11-oct-2025: acceso, limpieza o tiempo?
4. ¿Qué cambió en la operación a comienzos de 2025, cuando aparecieron a la vez las grietas del boom: material, frente, tonelaje u operadores?
5. ¿Qué procedimiento de soldadura y qué END de liberación se usaron en las reparaciones de BM-02, BM-03, BR-03, CU-01 y CU-02?
6. ¿Por qué CU-02 siguió operando en Crítico entre el 07-mar-2025 y el 19-jul-2025? ¿Hubo restricción de carga o monitoreo especial?
7. La medición de BR-01 bajó de 420 a 410 mm: ¿se usó el mismo método (PT o MT) y la misma referencia?

Este diagnóstico usa solo los datos calculados por la plataforma. Apoya el análisis; la decisión final corresponde al ingeniero responsable.`,
};
