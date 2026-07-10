import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { HttpWriteGuard } from './auth/http-write.guard';
import { UnitsModule } from './units/units.module';
import { WeaponModelsModule } from './weapon-models/weapon-models.module';
import { ShellsModule } from './shells/shells.module';
import { ChargesModule } from './charges/charges.module';
import { ShellCompatibleChargesModule } from './shell-compatible-charges/shell-compatible-charges.module';
import { FuzesModule } from './fuzes/fuzes.module';
import { WeaponSystemsModule } from './weapon-systems/weapon-systems.module';
import { FirePositionsModule } from './fire-positions/fire-positions.module';
import { FirePositionWeaponsModule } from './fire-position-weapons/fire-position-weapons.module';
import { DepotsModule } from './depots/depots.module';
import { DepotShellStockModule } from './depot-shell-stock/depot-shell-stock.module';
import { DepotChargeStockModule } from './depot-charge-stock/depot-charge-stock.module';
import { DepotFuzeStockModule } from './depot-fuze-stock/depot-fuze-stock.module';
import { DepotPrimerStockModule } from './depot-primer-stock/depot-primer-stock.module';
import { PrimersModule } from './primers/primers.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { FireMissionsModule } from './fire-missions/fire-missions.module';
import { ShellCompatibleFuzesModule } from './shell-compatible-fuzes/shell-compatible-fuzes.module';
import { ZonesModule } from './zones/zones.module';
import { StockModule } from './stock/stock.module';
import { SettingsModule } from './settings/settings.module';
import { AirThreatsModule } from './air-threats/air-threats.module';
import { ServiceOrdersModule } from './service-orders/service-orders.module';
import { RealtimeModule } from './realtime/realtime.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AccessScopeModule } from './access-scope/access-scope.module';
import { EventLogsModule } from './event-logs/event-logs.module';
import { OperatorShiftsModule } from './operator-shifts/operator-shifts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { DocumentsModule } from './documents/documents.module';
import { EwModule } from './ew/ew.module';
import { AirAssetsModule } from './air-assets/air-assets.module';
import { DroneLogisticsModule } from './drone-logistics/drone-logistics.module';
import { PlannedTripsModule } from './planned-trips/planned-trips.module';
import { ReconModule } from './modules/recon/recon.module';
import { ShotConfigurationsModule } from './shot-configurations/shot-configurations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: Number(config.get<string>('DB_PORT', '5433')),
        username: config.get<string>('DB_USER', 'euclida_user'),
        password: config.get<string>('DB_PASSWORD', 'euclida_password'),
        database: config.get<string>('DB_NAME', 'euclida_situation_db'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    UnitsModule,
    UsersModule,
    WeaponModelsModule,
    ShellsModule,
    ChargesModule,
    ShellCompatibleChargesModule,
    FuzesModule,
    WeaponSystemsModule,
    FirePositionsModule,
    FirePositionWeaponsModule,
    DepotsModule,
    DepotShellStockModule,
    DepotChargeStockModule,
    DepotFuzeStockModule,
    DepotPrimerStockModule,
    PrimersModule,
    StockMovementsModule,
    FireMissionsModule,
    ShellCompatibleFuzesModule,
    ZonesModule,
    StockModule,
    SettingsModule,
    AirThreatsModule,
    ServiceOrdersModule,
    RealtimeModule,
    AuthModule,
    AccessScopeModule,
    EventLogsModule,
    OperatorShiftsModule,
    AnalyticsModule,
    RecommendationsModule,
    DocumentsModule,
    EwModule,
AirAssetsModule,
DroneLogisticsModule,
PlannedTripsModule,
ReconModule,
ShotConfigurationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: HttpWriteGuard,
    },
  ],
})
export class AppModule {}
