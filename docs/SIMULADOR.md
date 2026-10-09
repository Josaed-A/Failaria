# Simulador de falla (vista `#/simulador`)

Responde **cuándo y cómo** fallaría cada pieza según la gravedad de su grieta, y deja experimentar con sobrecargas.

## Uso en 30 segundos

| Acción | Resultado |
|---|---|
| ▶ (o barra espaciadora) | El reloj avanza a la velocidad elegida (h simuladas por segundo); las 12 grietas crecen con la ley de Paris |
| Arrastrar en el 3D | Orbita la cámara |
| **Mantener pulsado sobre boom, brazo o cucharón y arrastrar** | Tira de la estructura: aparece la flecha roja del sobreesfuerzo `s`, la cámara queda fija, los puntos cercanos crecen `(1+s)^m` veces más rápido y la zona queda con daño permanente |
| «Avanzar solo al tirar» | El reloj corre únicamente mientras se tira: cada tirón son horas de operación bajo sobrecarga |
| Clic en una esfera o en una fila | Detalle del punto: longitud, tasa, modo, horas y fecha de falla, mecanismo dominante del FAD |
| ↺ | Vuelve al estado de la última inspección y limpia el daño del mouse |

## Modo por pieza e inspección

El selector **General · Boom · Brazo · Cucharón** muestra un solo componente, modelado según su esquema de inspección (`assets/esquemas`): boom con pie bifurcado, orejas de los cilindros, soporte del cilindro del brazo, horquilla de punta y mamparos; brazo ahusado con orejas en abanico, bujes y horquilla del cucharón; cucharón con concha, placas laterales, rejillas de desgaste, labio, dientes, cuchillas laterales, bujes y orejas del balancín. La simulación es la misma en todos los modos: las grietas siguen creciendo al cambiar de pieza.

En modo pieza aparece el panel **Inspección**: una tarjeta por punto con su estado, la grieta si existe (longitud simulada y último dato real), **Ver** (la cámara va al punto) y **Lupa** (vista cercana). También se puede tirar de la pieza con el mouse igual que en el modo general.

## Lupa de grieta

Vista cercana en 2D del punto seleccionado, a escala (regla en mm; `a_c` ocupa el ancho): campo de tensión de Irwin alrededor de las puntas (σ ∝ K/√(2πr)), zona plástica, marcas de Caution, Danger y `a_c`, la grieta actual y hasta dónde llegará en el próximo intervalo de inspección **sin carga** (trazo blanco) y **con el sobreesfuerzo aplicado** (trazo rojo). Arrastrar sobre la lupa aplica esfuerzo solo a ese punto, con las mismas consecuencias que tirar en el 3D.

## Qué se ve

* **Mapa FEA:** azul sano → rojo crítico. El halo de cada grieta crece con su gravedad `L/a_c`; el sobreesfuerzo del mouse se superpone en el punto de agarre y deja huella.
* **Grietas a escala:** barra negra perpendicular al eje de la pieza, 1 mm de grieta = 1 mm del modelo.
* **Esferas:** estado por umbral del formato; negra con halo rojo = falla.
* **Pieza en riesgo:** por zona, el punto que antes alcanza `a_c`, con horas y fecha.
* **FAD:** posición de los 12 puntos frente a la curva de falla.
* **Eventos:** cambios de estado, inicios de grieta por sobrecarga y fallas, con la hora simulada.

## Reporte de esfuerzo y causa de falla

Para cada punto el simulador registra el esfuerzo recibido: horas sobrecargado, sobreesfuerzo medio y máximo, **dosis** (horas equivalentes de daño adicional, ∫[(1+s)^m − 1]·dh) y cuántos mm creció la grieta con carga normal frente a cuántos por sobrecarga. El panel «Reporte de esfuerzo y falla» lo muestra en tabla y lo exporta a CSV.

Cuando un punto falla, el reporte dice **por qué**:

| Causa | Cuándo la declara | Qué significa |
|---|---|---|
| **Fatiga por horas de uso** | La grieta llegó a `a_c` y menos de la mitad de su crecimiento ocurrió bajo sobreesfuerzo | Falla «por tiempo»: se evitaba reparando a tiempo |
| **Fatiga acelerada por sobrecargas** | Llegó a `a_c`, pero más de la mitad del crecimiento ocurrió bajo sobreesfuerzo | Operar sobrecargado acortó la vida |
| **Fractura por fuerza excesiva** | Un tirón hace que la grieta actual cruce el FAD (K_r o L_r) aunque esté lejos de `a_c` | Falla súbita, sin aviso; el detalle indica si dominó la fractura (K_r) o el colapso del ligamento (L_r) y con qué sobreesfuerzo |

Modelo, supuestos y límites: [MANTENIMIENTO_Y_FALLA.md](MANTENIMIENTO_Y_FALLA.md). Parámetros: `src/config.js → falla`. Lógica: `src/falla.js` (verificada en `tests/verify.cjs`). Visor: `src/ui/simulador3d.js`.
