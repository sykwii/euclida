-- Rerunnable normalization for the simplified active readiness model.
UPDATE weapon_systems
SET readiness_status = CASE
      WHEN readiness_status IN ('ready', 'combat_ready', 'ready_for_combat')
        THEN 'combat_ready'
      ELSE 'not_combat_ready'
    END,
    not_ready_reason = CASE
      WHEN readiness_status IN ('ready', 'combat_ready', 'ready_for_combat')
        THEN NULL
      WHEN not_ready_reason = 'threat' THEN 'air_threat'
      WHEN not_ready_reason IN ('breakdown', 'maintenance', 'air_threat', 'crew', 'other')
        THEN not_ready_reason
      ELSE 'other'
    END;

UPDATE fire_positions
SET not_ready_reason = CASE
  WHEN not_ready_reason IN ('threat', 'damaged', 'prohibited', 'other')
    THEN not_ready_reason
  ELSE NULL
END;
