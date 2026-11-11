# Fisio Teide: citas online para una clínica de fisioterapia

Los pacientes piden cita eligiendo tratamiento, fisio y hora. La clínica gestiona la agenda de
cada profesional, lleva las fichas de paciente con notas clínicas y los recordatorios se envían
solos 24 horas antes.

**Stack:** Node.js 22 · Express 5 · MongoDB (Mongoose) · HTML, CSS y JavaScript sin frameworks.

## Qué hace

**Para el paciente**
- Tratamientos con duración y precio propios (30, 45 o 60 minutos).
- Elige fisio o "me da igual", y el sistema le asigna al que tenga la agenda más libre ese día.
- Calendario con los huecos libres de cada día y horas reales según el horario de cada profesional.
- Recordatorio automático el día antes. Puede cancelar online hasta 12 horas antes.

**Para la clínica** (`/admin`)
- Agenda del día en columnas por fisio, con sus horas de trabajo, vacaciones y la hora actual.
- Marcar citas como atendidas, no presentadas o canceladas.
- Fichas de paciente: historial de citas, sesiones atendidas, ausencias y notas clínicas.
- Crear citas que llegan por teléfono.

## Demo online

**[https://ikermarting.github.io/citas-fisioterapia/](https://ikermarting.github.io/citas-fisioterapia/)** · Panel: [https://ikermarting.github.io/citas-fisioterapia/admin/](https://ikermarting.github.io/citas-fisioterapia/admin/) (contraseña `demo`)

La demo funciona sin servidor: `npm run build:demo` genera la carpeta `docs/` con la web y el panel,
y un backend simulado en el navegador (`demo/server.js`) que responde a las mismas rutas que la API
real con la **misma lógica** de `src/lib/`. Los datos son de ejemplo y se guardan solo en el navegador
de quien la visita; la franja superior permite restablecerlos.

Después de cambiar algo en `public/` o `src/lib/`, vuelve a ejecutar `npm run build:demo` y sube `docs/`.

## Decisiones técnicas

### Reserva atómica sin transacciones
Cada profesional tiene un documento `AgendaDay` por día con sus tramos ocupados. Reservar es **un
único `updateOne` condicional**: "añade este tramo si no se solapa con ninguno de los que ya hay".

```js
AgendaDay.updateOne(
  { professional, date, booked: { $not: { $elemMatch: { start: { $lt: end }, end: { $gt: start } } } } },
  { $push: { booked: { start, end, appointment } } },
  { upsert: true },
);
```

MongoDB aplica las escrituras en un mismo documento de forma atómica, así que dos pacientes no
pueden quedarse con el mismo hueco. El índice único `(profesional, día)` evita además que dos
primeras reservas del mismo día creen dos agendas. Está explicado en `reserveInterval()`.

(El proyecto del restaurante resuelve el mismo problema de otra forma: un documento por bloque de
30 minutos y un índice único. Son dos técnicas distintas a propósito.)

### Recordatorios sin duplicados
Un proceso revisa cada minuto qué citas empiezan en las próximas 24 horas. Cada cita se "reclama"
con `findOneAndUpdate({ reminderSentAt: null })` antes de enviar. Aunque haya varias instancias del
servidor, solo una consigue marcar cada cita y nadie recibe el aviso dos veces.

### Horarios por profesional
Cada fisio tiene un horario semanal con varios tramos al día (mañana y tarde) y periodos de
vacaciones. La disponibilidad se calcula cruzando horario, citas ya reservadas, duración del
tratamiento, antelación mínima y ventana máxima de reserva. Todo está en `src/lib/schedule.js` como
funciones puras con tests.

### Pacientes por teléfono
El paciente se identifica por su teléfono (índice único). Si ya existe se reutiliza su ficha, así
el historial se acumula aunque reserve unas veces por la web y otras llamando.

## Estructura

```
src/
  config.js            Antelación, ventana de reserva, cancelación, recordatorios
  lib/schedule.js      Horarios, huecos libres, recordatorios (lógica pura)
  lib/                 Fechas, validación, tokens, códigos
  models/index.js      Professional, Service, Patient, Appointment, AgendaDay
  services/            Citas (reservar, cancelar), recordatorios y avisos
  routes/              API pública y API del panel
demo/                  Backend simulado para la demo de GitHub Pages
docs/                  Demo estática generada (npm run build:demo)
public/                Web de la clínica, "Mi cita" y panel /admin
scripts/seed.js        Fisios, tratamientos, pacientes y un mes de citas de ejemplo
test/                  Tests con node:test
```

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/services` | Tratamientos con duración, precio y quién los hace |
| GET | `/api/professionals` | Equipo |
| GET | `/api/availability/days?serviceId=&professionalId=&from=` | Huecos libres por día (14 días) |
| GET | `/api/availability?serviceId=&professionalId=&date=` | Horas libres de un día |
| POST | `/api/appointments` | Pedir cita |
| POST | `/api/appointments/lookup` | Ver cita (código + teléfono) |
| POST | `/api/appointments/cancel` | Cancelar cita |
| POST | `/api/admin/login` | Entrar en el panel |
| GET | `/api/admin/agenda?date=` | Agenda del día por profesional |
| POST | `/api/admin/appointments` | Cita creada desde recepción |
| PATCH | `/api/admin/appointments/:id` | Cambiar estado |
| GET | `/api/admin/patients?q=` | Buscar pacientes |
| GET | `/api/admin/patients/:id` | Ficha con historial y notas |
| POST | `/api/admin/patients/:id/notes` | Añadir nota clínica |

## Arrancarlo en local

Hace falta Node 22.9 o superior y un MongoDB (local o un cluster gratis de Atlas).

```bash
cp .env.example .env      # y rellena MONGODB_URI, ADMIN_PASSWORD y TOKEN_SECRET
npm install
npm run seed
npm run dev               # http://localhost:3000 y http://localhost:3000/admin
npm test
```

## Desplegarlo gratis

Es igual que el proyecto del restaurante: MongoDB Atlas (gratis) y un *Web Service* en Render con
el build command `npm install`, el start command `npm start` y las variables `MONGODB_URI`,
`ADMIN_PASSWORD`, `TOKEN_SECRET` y `NODE_ENV=production`.

En el plan gratuito de Render el servidor se duerme cuando no hay tráfico, y mientras duerme no
salen recordatorios. Para producción hace falta un plan siempre encendido o un cron externo.

## Siguientes pasos

- Envío real de recordatorios por email o WhatsApp en `src/services/notifier.js`.
- Usuarios por profesional, para que cada fisio vea solo sus notas.
- Bloquear huecos sueltos desde el panel (reuniones, descansos).
- Cumplimiento del RGPD para datos de salud: consentimiento, cifrado de las notas y registro de accesos.
