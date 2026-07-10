# Entity and SQL schema comparison

Generated: 2026-07-10 14:59:36

Entities: 58
Entity columns: 602
SQL columns detected: 591

## Entity columns not detected in SQL

- `air_asset_positions.asset_group` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.asset_name` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.asset_quantity` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.callsign` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.combat_type` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.created_at` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.drone_model` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.lat` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.lng` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.main_direction_degrees` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.main_direction_units` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.max_sector_distance_m` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.mgrs` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.name` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.not_ready_reason` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.note` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.personnel_rotation_date` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.readiness_status` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.recon_type` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.sector_left_degrees` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.sector_right_degrees` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.traverse_left_degrees` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.traverse_left_units` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.traverse_right_degrees` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.traverse_right_units` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.unit_id` — backend\src\air-assets\air-asset-position.entity.ts
- `air_asset_positions.updated_at` — backend\src\air-assets\air-asset-position.entity.ts
- `air_threats.created_at` — backend\src\air-threats\air-threat.entity.ts
- `air_threats.id` — backend\src\air-threats\air-threat.entity.ts
- `air_threats.is_active` — backend\src\air-threats\air-threat.entity.ts
- `air_threats.lat` — backend\src\air-threats\air-threat.entity.ts
- `air_threats.lng` — backend\src\air-threats\air-threat.entity.ts
- `air_threats.removed_at` — backend\src\air-threats\air-threat.entity.ts
- `air_threats.threat_type` — backend\src\air-threats\air-threat.entity.ts
- `app_settings.updated_at` — backend\src\settings\app-setting.entity.ts
- `app_settings.value` — backend\src\settings\app-setting.entity.ts
- `depots.is_archived` — backend\src\depots\depot.entity.ts
- `fire_positions.ammo_depot_id` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.main_direction_degrees` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.main_direction_units` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.sector_left_degrees` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.sector_right_degrees` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.traverse_left_degrees` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.traverse_left_units` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.traverse_right_degrees` — backend\src\fire-positions\fire-position.entity.ts
- `fire_positions.traverse_right_units` — backend\src\fire-positions\fire-position.entity.ts
- `operator_shifts.created_at` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.ended_at` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.note` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.operator_login` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.operator_name` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.operator_user_id` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.started_at` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.status` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.unit_id` — backend\src\operator-shifts\operator-shift.entity.ts
- `operator_shifts.updated_at` — backend\src\operator-shifts\operator-shift.entity.ts
- `planned_vehicle_trips.unit_id` — backend\src\planned-trips\planned-vehicle-trip.entity.ts
- `stock_movements.document_number` — backend\src\stock-movements\stock-movement.entity.ts
- `stock_movements.fire_mission_id` — backend\src\stock-movements\stock-movement.entity.ts
- `stock_movements.movement_group_id` — backend\src\stock-movements\stock-movement.entity.ts
- `stock_movements.movement_type` — backend\src\stock-movements\stock-movement.entity.ts
- `weapon_systems.weapon_model_id` — backend\src\weapon-systems\weapon-system.entity.ts
- `zones.weapon_model_id` — backend\src\zones\zone.entity.ts

## SQL columns without detected Entity columns

These are not automatically defects. Some tables or columns may be used only by raw SQL.

- `air_asset_calculations.callsign`
- `air_asset_calculations.created_at`
- `air_asset_calculations.endurance_minutes`
- `air_asset_calculations.id`
- `air_asset_calculations.lat`
- `air_asset_calculations.lng`
- `air_asset_calculations.mgrs`
- `air_asset_calculations.name`
- `air_asset_calculations.note`
- `air_asset_calculations.payload`
- `air_asset_calculations.platform_type`
- `air_asset_calculations.readiness_status`
- `air_asset_calculations.unit_id`
- `air_asset_calculations.updated_at`
- `charge_configurations.charge_id`
- `charge_configurations.charge_units_per_shot`
- `charge_configurations.created_at`
- `charge_configurations.id`
- `charge_configurations.is_default`
- `charge_configurations.label`
- `charge_configurations.note`
- `charge_configurations.updated_at`
- `charge_configurations.zone_id`
- `fire_positions.built_by_unit_id`
- `fire_positions.geom`
- `fire_positions.on_value`
- `fire_positions.traverse_left`
- `fire_positions.traverse_right`
- `position_drone_stock.air_asset_position_id`
- `position_drone_stock.drone_model_id`
- `position_drone_stock.id`
- `position_drone_stock.quantity`
- `position_drone_warhead_stock.air_asset_position_id`
- `position_drone_warhead_stock.id`
- `position_drone_warhead_stock.quantity`
- `position_drone_warhead_stock.warhead_type_id`
- `recon_correlations.accepted_at`
- `recon_correlations.rejected_at`
- `recon_impact_observations.archived_at`
- `recon_impact_observations.hidden_at`
- `recon_impact_observations.notes`
- `recon_observations.archived_at`
- `recon_observations.hidden_at`
- `recon_observations.report_id`
- `recon_puar_proposals.accepted_at`
- `weapon_systems.battery_id`
- `weapon_systems.division_id`
- `weapon_systems.platoon_id`
- `weapon_systems.squad_id`
- `weapon_systems.system_type`
- `weapon_systems.zones_count`
- `zones.weapon_model`
