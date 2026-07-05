// ============================================================
// userProject — Proyecto del usuario "Teatro Tecal" (teatro_tecal)
// Archivo de guardado con las INSTANCIAS que el usuario ha colocado.
// Contiene la jerarquía, iconos y colores de cada nodo.
// ============================================================

export const userProject = {
    name: "teatro_tecal",
    version: "2.0",

    arquitectura: {
        title: "ESPACIO ARQUITECTÓNICO",
        tree: [
            {
                name: "Caja Escénica",
                type: "folder",
                icon: "ph-package",
                id: "contenedor-arq",
                children: [
                    { name: "Paredes", type: "folder", icon: "ph-layout", id: "paredes", children: [
                        { name: "Fondo", type: "item", color: "cyan", id: "pared-fondo" },
                        { name: "Izquierda", type: "item", color: "cyan", id: "pared-izq" },
                        { name: "Derecha", type: "item", color: "cyan", id: "pared-der" }
                    ]},
                    { name: "Piso", type: "item", color: "green", id: "piso" }
                ]
            },
            {
                name: "Platea",
                type: "folder",
                icon: "ph-stairs",
                children: [
                    { name: "Gradería Inferior", type: "item", color: "gray" },
                    { name: "Pasillos", type: "item", color: "gray" }
                ]
            }
        ]
    },

    escena: {
        title: "ESPACIO ESCÉNICO",
        tree: [
            {
                name: "Escenotecnia",
                type: "folder",
                icon: "ph-wrench",
                children: [
                    { name: "Tramoya / Barras", type: "folder", id: "barras", children: [
                        { name: "Barra 1", type: "item", color: "magenta", id: "barra-1" },
                        { name: "Barra 2", type: "item", color: "magenta", id: "barra-2" },
                        { name: "Barra 3", type: "item", color: "magenta", id: "barra-3" },
                        { name: "Barra 4", type: "item", color: "magenta", id: "barra-4" },
                        { name: "Barra 5", type: "item", color: "magenta", id: "barra-5" }
                    ]},
                    { name: "Vestiduras", type: "folder", children: [
                        { name: "Telón de Boca", type: "item", color: "red" },
                        { name: "Cámara Negra", type: "item", color: "black" }
                    ]}
                ]
            },
            {
                name: "Escenografía",
                type: "folder",
                icon: "ph-cube",
                children: [
                    { name: "Practicable Central", type: "item", color: "orange" },
                    { name: "Rampa", type: "item", color: "orange" }
                ]
            },
            {
                name: "Utilería",
                type: "folder",
                icon: "ph-armchair",
                children: [
                    { name: "Mobiliario de Escena", type: "item", color: "yellow" },
                    { name: "Utilería de Mano", type: "item", color: "yellow" }
                ]
            },
            {
                name: "Volúmenes Técnicos",
                type: "folder",
                icon: "ph-speaker-hifi",
                children: [
                    { name: "Altavoces PA (L/R)", type: "item", color: "gray" },
                    { name: "Monitores de Piso", type: "item", color: "gray" },
                    { name: "Rack de Escenario", type: "item", color: "gray" }
                ]
            }
        ]
    },

    iluminacion: {
        title: "ILUMINACIÓN Y MEDIOS",
        tree: [
            {
                name: "Luminarias",
                type: "folder",
                icon: "ph-headlights",
                children: [
                    { name: "Convencionales (PC/Fresnel)", type: "item", color: "yellow" },
                    { name: "Móviles (Spot/Wash)", type: "item", color: "cyan" }
                ]
            },
            {
                name: "Video y Mapping",
                type: "folder",
                icon: "ph-projector-screen",
                children: [
                    { name: "Proyector Frontal", type: "item", color: "blue" },
                    { name: "Superficie de Proyección", type: "item", color: "purple" }
                ]
            },
            {
                name: "Atmósfera",
                type: "folder",
                icon: "ph-cloud",
                children: [
                    { name: "Máquina de Humo", type: "item", color: "white" }
                ]
            }
        ]
    },

    personas: {
        title: "PERSONAS Y ELENCO",
        tree: [
            {
                name: "Personas",
                type: "folder",
                icon: "ph-users",
                children: [
                    {
                        name: "Actores",
                        type: "folder",
                        icon: "ph-user-focus",
                        children: [
                            { name: "Protagonista", type: "item", color: "blue" },
                            { name: "Coro / Extras", type: "item", color: "blue" }
                        ]
                    },
                    {
                        name: "Músicos",
                        type: "folder",
                        icon: "ph-music-notes",
                        children: [
                            { name: "Director de Orquesta", type: "item", color: "blue" },
                            { name: "Cuarteto de Cuerdas", type: "item", color: "blue" }
                        ]
                    },
                    {
                        name: "Público",
                        type: "folder",
                        icon: "ph-user-list",
                        children: [
                            { name: "Público 1ra Fila", type: "item", color: "gray" },
                            { name: "Público Balcón", type: "item", color: "gray" }
                        ]
                    }
                ]
            }
        ]
    }
};
