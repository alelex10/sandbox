# Suscripciones con Mercado Pago — contexto, decisiones y alternativas

> Documento vivo. Propósito: registrar cómo se llegó a las dos soluciones candidatas,
> por qué se descartaron las otras, y los contras de cada una, apoyado en la
> documentación oficial de Mercado Pago y en el historial de problemas documentado
> en Engram.
>
> Última actualización: 2026-08-18
>
> **Metodología de validación:** cada afirmación está clasificada en el §9 según su
> nivel de evidencia: (a) confirmada por documentación oficial vigente, (b) evidencia
> empírica de pruebas manuales (tomada como verdadera por orden del autor, testeada
> contra APIs reales de MP), o (c) inferencia/razonamiento del equipo. Lo verificado
> contra docs oficiales fue revisado el 2026-08-18 vía websearch + Context7.

---

## 1. Objetivo

Implementar suscripciones recurrentes con Mercado Pago de modo que el **match entre el
subscriptor del lado de Mercado Pago y la API propia** sea confiable, sin huecos de error,
y con la mejor experiencia de usuario posible.

## 2. Restricciones de negocio (contexto previo)

Decisiones de producto ya tomadas en la etapa 4 (La Liga FICBA, cambio `mp-subscriptions-preapproval-plan`):

- **Bloqueo de doble cobro = exclusión mutua** entre pago manual y suscripción MP por período:
  - Si el socio YA PAGÓ ese mes por otra vía → se bloquea la opción de suscribirse ese mes.
  - Si el socio YA ESTÁ SUSCRIPTO → se bloquea el pago manual de ese período.
- El disparador del bloqueo es cualquier pago no-suscripción del período (Payment PAYED con
  proof de efectivo, transferencia, admin manual o pago único MP).
- Con el bloqueo activo, **ya no importa cobrar desde el primer día** (era el problema que
  resolvía el enfoque A.1 previo).

## 3. Antecedentes: problemas documentados en Engram

- **Preapproval sin plan generó fallas al realizar los pagos** (2026-08-13): en La Liga FICBA
  se ABANDONÓ el enfoque con `preapproval` (que servía para respetar el día de pago, incluido
  cobrar desde el primer día) porque estaba generando fallas al realizar los pagos. Se volvió
  a `preapprovalPlan`. → Antecedente directo a considerar para la Solución A.
- **Regla dura de la documentación oficial** (investigado 2026-08-14): "una suscripción con
  plan asociado debe crearse SIEMPRE con `card_token_id` y status `Authorized`". Esto explica
  gran parte de la investigación previa (ver §4).
- **Paginación duplica resultados** (2026-08-18): `GET /preapproval/search` con paginación por
  offset devuelve resultados duplicados entre páginas → hay que deduplicar por `id` en el lado
  de la API.
- **Suscripciones de prueba cobrando** (2026-08-18): se cancelaron 4 preapprovals de prueba
  ($16/mes) que estaban activas; lección operativa: controlar/liquidar siempre las
  suscripciones de prueba con token de collector para no generar cobros reales.

## 4. Qué dice la documentación oficial (reglas duras, vigentes al 2026-08-18)

### Con plan asociado (`preapproval_plan_id`)

> "A subscription with an associated plan **must always be created with your `card_token_id`
> and with the status `Authorized`**."

- `card_token_id` OBLIGATORIO + status forzado a `authorized`.
- NO existe modo `pending` con plan.
- NO se genera un `init_point` nuevo por suscripción: el único `init_point` del mundo "con
  plan" es el del PLAN (`preapproval_plan.init_point`), que es **compartido por todos los
  suscriptores y NO lleva `external_reference`**.

### Sin plan asociado ("con pago pendiente")

- Body al `POST /preapproval`: `reason`, `external_reference`, `payer_email`, `auto_recurring`
  (frequency, frequency_type, transaction_amount, currency_id, end_date), `back_url`,
  **`status: "pending"`** — SIN `preapproval_plan_id` y SIN `card_token_id`.
- "No se define un método de pago en el momento de su creación"; el pago queda pending hasta
  que el usuario elige medio.
- Devuelve un **`init_point` PROPIO del preapproval** (`.../subscriptions/checkout?preapproval_id=...`);
  MP hostea el checkout donde el pagador carga la tarjeta.
- Se completa luego vía `PUT /preapproval/{id}` o compartiendo el link.
- La doc del API Reference describe `status: "pending"` como "suscripción sin método de
  pago" y `init_point` como "URL al checkout para **agregar o modificar** el método de
  pago" → confirma la mecánica de la Solución A (checkout hosteado para completar el alta).
- Nota: `external_reference`, `reason` y `back_url` se documentan como **"solo se requieren
  para suscripciones sin plan asociado"** → con plan no hay `external_reference` propio
  obligatorio (ver §7).
- Validación de email: en suscripciones sin plan, durante el pago se valida que el email
  cargado coincida con el del pagador; si no coinciden, el pago se rechaza.
- Variante documentada: sin plan también se puede crear con `status: "authorized"` +
  `card_token_id` (pago autorizado directo, sin checkout intermedio) → es la base de la
  Solución B.

### Conclusión documental

Las dos cosas que en algún momento se quisieron combinar (**plan asociado + init_point nuevo
sin tokenizar**) son **incompatibles por diseño** de MP. Hay que elegir camino.

Fuentes:

- https://www.mercadopago.com.ar/developers/en/docs/subscriptions/integration-configuration/subscription-associated-plan
- https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/create-preapproval/post
- https://www.mercadopago.com.mx/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments

---

## 5. Solución A — Preapproval con `init_point` / checkout de MP (sin plan, pago pendiente)

### Cómo funciona

- Se crea el preapproval con `status: pending` y sin tokenizar; MP devuelve un `init_point`
  propio que se le entrega al usuario (link o redirección).
- MP hostea el checkout: el usuario elige el medio de pago ahí mismo (sin tocar nuestro
  frontend para cargar la tarjeta).
- `external_reference` viaja en la creación y vuelve en los webhooks → atribución limpia.

### Evidencia de pruebas manuales (testeado contra APIs reales; evidencia empírica, no documentable)

Respaldo documental parcial: Mercado Pago anunció en 2026-02-26 ("Unified card and
customer management in Checkout API") una **migración/unificación centralizada del manejo
de tarjetas guardadas** ("Save cards"), con guías de migración de CardForm y Web Tokenize
Checkout v2 hacia Checkout Bricks. Es decir, en 2026 MP efectivamente estuvo migrando el
método card — consistente con la falla observada. La forma exacta en que eso impactó el
checkout de suscripciones no está documentada públicamente; quedó como observación empírica.

- **Con cuenta de MP logueada**: solo funcionaba suscribirse con tarjeta — y OJO: no con
  tarjetas precargadas/guardadas, había que ingresar la tarjeta nuevamente. Este flujo
  **dejó de funcionar** porque (según lo observado) Mercado Pago estaba en una migración
  respecto al método de card.
- **Sin loguearse en Mercado Pago**: funciona. Pero requiere una guía para que el usuario
  sepa cuál es el método que funciona → se percibe como algo vago y la experiencia de
  usuario es baja.

### Contras

1. **UX baja y flujo "vago"**: el usuario no logueado necesita una guía para encontrar el
   método que funciona; la experiencia queda a cargo de un checkout genérico de MP.
2. **Dependencia del checkout hosteado**: si MP cambia/migra el flujo (como pasó con el
   método card), el alta puede romperse sin que podamos parchearlo del lado nuestro.
3. **Con cuenta logueada el flujo quedó roto** (migración de card): hoy solo es confiable el
   camino "sin loguearse".
4. **Antecedente de fallas en el cobro recurrente**: el enfoque preapproval sin plan ya se
   probó en La Liga y generó fallas al realizar los pagos (fue el motivo del revert a
   `preapprovalPlan`). Aunque el alta sea distinta, el cobro recurrente comparte el mismo
   mecanismo.

## 6. Solución B — Preapproval con `card_token_id` (tokenización en nuestro frontend)

### Cómo funciona

- Creamos una interfaz donde el usuario carga los datos de su tarjeta; con Bricks/MP.js se
  genera un `card_token_id` sin que los datos pasen por nuestro backend (tokenización
  segura, vía SDK de MP).
- El `card_token_id` se envía al `POST /preapproval` (con o sin `preapproval_plan_id`) con
  status `authorized` → la suscripción queda activa directamente, sin checkout intermedio.
- Atribución limpia por `external_reference` propio (si se usa sin plan).

### Contra principal (feedback de un compañero)

> "No parece algo fiable; para el usuario puede ser raro ingresar su tarjeta" en una
> interfaz que no es de Mercado Pago.

1. **Percepción de fiabilidad baja**: el usuario desconfía al cargar datos de tarjeta fuera
   del checkout conocido de MP, aunque la tokenización sea segura (los datos van al SDK de
   MP, no a nuestro servidor).
2. **Esfuerzo de UI/UX propio**: hay que diseñar y mantener el formulario de tarjeta
   (validaciones, errores, bancos rechazados, etc.).
3. **Confianza educacional**: requiere comunicar bien que el pago es procesado por MP
   (branding, candado, textos) para mitigar la desconfianza.

## 7. Por qué `preapproval_plan` (solo, como entidad reutilizable) NO sirve

- Para que el **match entre subscriptores de MP y la API propia** funcione, el usuario tiene
  que redireccionarse **sí o sí a nuestro frontend** para capturar el `preapproval_id`
  (que es el mismo que `external_reference`, creado automáticamente por MP en el checkout).
- Con plan asociado no hay `external_reference` propio por suscripción (la doc lo marca
  como campo "solo requerido para suscripciones sin plan"; el init_point del plan es
  compartido y no lo lleva) → la atribución solo sería rastreable por `mpId`, y el match
  depende de capturar el `preapproval_id` en la redirección.
- Ese mecanismo de captura es **un hueco de error grande**: si la redirección se pierde, se
  duplica, o el usuario cierra la pestaña, perdemos el vínculo entre la suscripción de MP y
  el subscriptor en nuestra API.

## 8. Por qué NO combinar `preapproval` + `preapproval_plan`

- La combinación **no es mejor que usar solo preapproval**: arrastra los contras de ambos
  sin sumar beneficios.
- Además, la documentación lo hace inviable como "mejor de ambos mundos": con plan asociado
  es obligatorio `card_token_id` + `authorized` (cae en la Solución B), y sin plan el
  `init_point` propio solo existe si NO se manda el plan. Son mutuamente excluyentes por
  diseño (§4).

---

## 9. Nivel de validación de cada afirmación

| # | Afirmación | Fuente | Estado |
|---|---|---|---|
| 1 | Con `preapproval_plan_id` → `card_token_id` obligatorio + `authorized` | Doc oficial (subscription-associated-plan, AR/CO/MX; verificado 2026-08-18) | ✅ Confirmado por doc |
| 2 | Con plan no hay `init_point` propio por suscripción; el del plan es compartido sin `external_reference` | Doc oficial + investigación previa (memoria Engram #365) | ✅ Confirmado por doc/investigación |
| 3 | Sin plan + `status: pending` → sin tokenizar, `init_point` propio, `external_reference` propio | Doc oficial (pending-payments + API Reference; websearch + Context7, 2026-08-18) | ✅ Confirmado por doc |
| 4 | `external_reference` / `reason` / `back_url` "solo requeridos para suscripciones sin plan" | API Reference oficial `POST /preapproval` | ✅ Confirmado por doc |
| 5 | `status` pending = "sin método de pago"; `init_point` = "checkout para agregar/modificar método de pago" | API Reference oficial | ✅ Confirmado por doc |
| 6 | MP estuvo en migración del método card (unificación "Save cards", CardForm/WebTokenize → Bricks) | News oficial MP 2026-02-26 + guías de migración | ✅ Confirmado (migración existe) |
| 7 | Con cuenta logueada: solo tarjeta nueva (no precargadas guardadas), reingreso obligatorio | Pruebas manuales del autor | 🧪 Evidencia empírica |
| 8 | El flujo con cuenta logueada dejó de funcionar (migración card) | Pruebas manuales del autor | 🧪 Evidencia empírica |
| 9 | Sin loguearse en MP: el alta funciona | Pruebas manuales del autor | 🧪 Evidencia empírica |
| 10 | UX baja y "vaga" sin loguearse; requeriría guía al usuario | Juicio del autor sobre la prueba | 🧪 Empírica + inferencia |
| 11 | El match subscriptor↔API con plan exige capturar `preapproval_id` (= `external_reference` generado por MP en el checkout) en redirección al frontend → hueco de error grande | Razonamiento del autor + respaldo parcial (doc: sin plan es donde viaja `external_reference`) | 🧠 Inferencia con respaldo documental |
| 12 | Combinar preapproval + preapproval_plan no mejora nada vs solo preapproval; son excluyentes por diseño | Doc oficial (regla dura) + razonamiento | ✅ Doc + 🧠 inferencia |
| 13 | Preapproval sin plan generó fallas al realizar los pagos (antecedente La Liga) | Memoria Engram #340 (decisión revert 13/8) | 📓 Historial interno |
| 14 | `GET /preapproval/search` paginado duplica resultados | Memoria Engram #413 (descubierto 18/8) | 📓 Historial interno |

**Leyenda:** ✅ doc oficial vigente · 🧪 evidencia empírica propia · 🧠 inferencia/razonamiento · 📓 historial interno (Engram)

> Las filas 🧪 no son verificables contra documentación pública: describen el
> comportamiento runtime del checkout de MP, que MP no documenta. Si en el futuro
> cambia el comportamiento, actualizar estas filas.

---

## 10. Comparativa y estado de la decisión

| Criterio | A: init_point / checkout MP | B: card_token_id (form propio) |
|---|---|---|
| Alta del subscriptor | Checkout hosteado por MP | Formulario propio + tokenización |
| UX del alta | Baja sin guía; logueado roto (migración card) | Depende de nuestro diseño |
| Fiabilidad percibida | Alta (es MP quien muestra el pago) | Baja (desconfianza al cargar tarjeta) |
| Atribución (match con API propia) | `external_reference` propio | `external_reference` propio |
| Dependencia de cambios de MP | Alta (checkout ajeno) | Media (SDK de tokenización) |
| Esfuerzo de implementación | Bajo | Alto (UI + validaciones) |

> Pendiente: definir cuál de las dos soluciones se adopta (o si se mitigan los contras)
> con la evidencia recopilada.