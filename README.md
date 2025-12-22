# VotingBot
Bot de votaciones para el discord de KOI Noboris

## Iconos de equipos LEC

Los botones de votación soportan emoji por opción. Para mostrar el icono de un equipo (G2, FNC, etc.), sube los iconos como **emojis personalizados** en tu servidor de Discord y configura la variable `LEC_TEAM_EMOJIS` con un JSON.

Ejemplo:

```env
LEC_TEAM_EMOJIS={"G2":"<:g2:123456789012345678>","FNC":"<:fnc:234567890123456789>","KOI":"<:koi:345678901234567890>"}
```

Luego, al crear una predicción con opciones como `G2,FNC` o `G2 Esports,Fnatic`, el bot intentará asignar el emoji correspondiente al botón.
