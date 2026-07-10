# Backend module dependencies

Generated: 2026-07-10 14:29:14

## AccessScopeModule

- Module — `@nestjs/common`
- TypeOrmModule — `@nestjs/typeorm`

## AirAssetsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AuthModule — `../auth/auth.module`
- EventLogsModule — `../event-logs/event-logs.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## AirThreatsModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- SettingsModule — `../settings/settings.module`
- TypeOrmModule — `@nestjs/typeorm`

## AnalyticsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AirThreatsModule — `../air-threats/air-threats.module`
- AuthModule — `../auth/auth.module`
- Module — `@nestjs/common`
- ServiceOrdersModule — `../service-orders/service-orders.module`

## AppModule

- AccessScopeModule — `./access-scope/access-scope.module`
- AirAssetsModule — `./air-assets/air-assets.module`
- AirThreatsModule — `./air-threats/air-threats.module`
- AnalyticsModule — `./analytics/analytics.module`
- AuthModule — `./auth/auth.module`
- ChargesModule — `./charges/charges.module`
- ConfigModule — `@nestjs/config`
- DepotChargeStockModule — `./depot-charge-stock/depot-charge-stock.module`
- DepotFuzeStockModule — `./depot-fuze-stock/depot-fuze-stock.module`
- DepotPrimerStockModule — `./depot-primer-stock/depot-primer-stock.module`
- DepotShellStockModule — `./depot-shell-stock/depot-shell-stock.module`
- DepotsModule — `./depots/depots.module`
- DocumentsModule — `./documents/documents.module`
- DroneLogisticsModule — `./drone-logistics/drone-logistics.module`
- EventLogsModule — `./event-logs/event-logs.module`
- EwModule — `./ew/ew.module`
- FireMissionsModule — `./fire-missions/fire-missions.module`
- FirePositionsModule — `./fire-positions/fire-positions.module`
- FirePositionWeaponsModule — `./fire-position-weapons/fire-position-weapons.module`
- FuzesModule — `./fuzes/fuzes.module`
- Module — `@nestjs/common`
- OperatorShiftsModule — `./operator-shifts/operator-shifts.module`
- PlannedTripsModule — `./planned-trips/planned-trips.module`
- PrimersModule — `./primers/primers.module`
- RealtimeModule — `./realtime/realtime.module`
- RecommendationsModule — `./recommendations/recommendations.module`
- ReconModule — `./modules/recon/recon.module`
- ServiceOrdersModule — `./service-orders/service-orders.module`
- SettingsModule — `./settings/settings.module`
- ShellCompatibleChargesModule — `./shell-compatible-charges/shell-compatible-charges.module`
- ShellCompatibleFuzesModule — `./shell-compatible-fuzes/shell-compatible-fuzes.module`
- ShellsModule — `./shells/shells.module`
- StockModule — `./stock/stock.module`
- StockMovementsModule — `./stock-movements/stock-movements.module`
- TypeOrmModule — `@nestjs/typeorm`
- UnitsModule — `./units/units.module`
- UsersModule — `./users/users.module`
- WeaponModelsModule — `./weapon-models/weapon-models.module`
- WeaponSystemsModule — `./weapon-systems/weapon-systems.module`
- ZonesModule — `./zones/zones.module`

## AuthModule

- ConfigModule — `@nestjs/config`
- JwtModule — `@nestjs/jwt`
- Module — `@nestjs/common`
- UsersModule — `../users/users.module`

## ChargesModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## DepotChargeStockModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## DepotFuzeStockModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## DepotPrimerStockModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## DepotShellStockModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## DepotsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## DocumentsModule

- AuthModule — `../auth/auth.module`
- Module — `@nestjs/common`
- TypeOrmModule — `@nestjs/typeorm`

## DroneLogisticsModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## EventLogsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AuthModule — `../auth/auth.module`
- Module — `@nestjs/common`
- TypeOrmModule — `@nestjs/typeorm`

## EwModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AuthModule — `src/auth/auth.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## FireMissionsModule

- AuthModule — `../auth/auth.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## FirePositionsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AuthModule — `../auth/auth.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## FirePositionWeaponsModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## FuzesModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## OperatorShiftsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AuthModule — `../auth/auth.module`
- EventLogsModule — `../event-logs/event-logs.module`
- Module — `@nestjs/common`
- TypeOrmModule — `@nestjs/typeorm`

## PlannedTripsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## PrimersModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## RealtimeModule

- Module — `@nestjs/common`

## RecommendationsModule

- AuthModule — `../auth/auth.module`
- Module — `@nestjs/common`
- TypeOrmModule — `@nestjs/typeorm`

## ReconModule

- Module — `@nestjs/common`
- RealtimeModule — `../../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## ServiceOrdersModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AuthModule — `../auth/auth.module`
- EventLogsModule — `src/event-logs/event-logs.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- ReconModule — `../modules/recon/recon.module`
- TypeOrmModule — `@nestjs/typeorm`

## SettingsModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## ShellCompatibleChargesModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## ShellCompatibleFuzesModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## ShellsModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## StockModule

- AccessScopeModule — `../access-scope/access-scope.module`
- Module — `@nestjs/common`
- TypeOrmModule — `@nestjs/typeorm`

## StockMovementsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## UnitsModule

- AuthModule — `../auth/auth.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## UsersModule

- ConfigModule — `@nestjs/config`
- JwtModule — `@nestjs/jwt`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## WeaponModelsModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## WeaponSystemsModule

- AccessScopeModule — `../access-scope/access-scope.module`
- AuthModule — `../auth/auth.module`
- EventLogsModule — `../event-logs/event-logs.module`
- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

## ZonesModule

- Module — `@nestjs/common`
- RealtimeModule — `../realtime/realtime.module`
- TypeOrmModule — `@nestjs/typeorm`

