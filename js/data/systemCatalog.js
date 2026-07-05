// ============================================================
// systemCatalog — Plantillas maestras del catálogo de assets
// Define TODO lo que el usuario PODRÍA agregar al hacer clic en (+).
// ============================================================

export const systemCatalog = {
    escenotecnia: [
        { id: "vara_motorizada", name: "Vara Motorizada", icon: "ph-minus", type: "item" },
        { id: "pata_aforo", name: "Pata (Aforo)", icon: "ph-flag-banner", type: "item" }
    ],
    iluminacion: [
        { id: "pc_1000w", name: "PC 1000w", icon: "ph-headlights", defaultColor: "yellow" },
        { id: "led_wash", name: "Cabeza Móvil Wash", icon: "ph-lightbulb", defaultColor: "cyan" }
    ],
    personas: [
        { id: "actor_hombre", name: "Hombre (1.75m)", icon: "ph-user-focus" },
        { id: "actor_mujer", name: "Mujer (1.65m)", icon: "ph-user-focus" }
    ]
};
