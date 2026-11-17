# Procedencia

- Proyecto: [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)
- Archivo fuente: [`src/state/memory-utils.ts`](https://github.com/rohitg00/agentmemory/blob/54bbb7cd351e222a7e29e68b37076e97297eba6a/src/state/memory-utils.ts)
- Commit del clon local: `54bbb7cd351e222a7e29e68b37076e97297eba6a`
- Licencia: Apache-2.0, copia completa en [`LICENSE`](LICENSE); el clon no contiene archivo NOTICE.

`memory-utils.mjs` adapta la función `supersededAt(previous, now)` para monotonía temporal: conserva `now` si es válido y posterior a la fecha previa; en caso contrario, avanza un milisegundo desde la previa, limitado al máximo representable por Date. Se retiraron tipos TypeScript y dependencias de terceros. El runtime usa este valor al archivar versiones sustituidas de una misma clave, incluso cuando varias escrituras caen en el mismo milisegundo.

No se copiaron otras partes del repositorio ni se añadieron dependencias de AgentMemory.
