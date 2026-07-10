import { Routes } from '@angular/router';
import { AirThreatsPage } from './features/air-threats/air-threats-page/air-threats-page';
import { LoginPage } from './features/auth/login-page/login-page';
import { authGuard } from './features/auth/auth.guard';
import { ChargesPage } from './features/charges/charges-page/charges-page';
import { DepotsPage } from './features/depots/depots-page/depots-page';
import { FireMissionsPage } from './features/fire-missions/fire-missions-page/fire-missions-page';
import { FirePositionsPage } from './features/fire-positions/fire-positions-page/fire-positions-page';
import { EwPage } from './features/ew/ew-page/ew-page';
import { AirAssetsPage } from './features/air-assets/air-assets-page/air-assets-page';
import { FuzesPage } from './features/fuzes/fuzes-page/fuzes-page';
import { MapPage } from './features/map/map-page/map-page';
import { PrimersPage } from './features/primers/primers-page/primers-page';
import { ServiceOrdersPage } from './features/service-orders/service-orders-page/service-orders-page';
import { SettingsPage } from './features/settings/settings-page/settings-page';
import { ShellCompatibleChargesPage } from './features/shell-compatible-charges/shell-compatible-charges-page/shell-compatible-charges-page';
import { ShellCompatibleFuzesPage } from './features/shell-compatible-fuzes/shell-compatible-fuzes-page/shell-compatible-fuzes-page';
import { ShellsPage } from './features/shells/shells-page/shells-page';
import { StockMovementsPage } from './features/stock-movements/stock-movements-page/stock-movements-page';
import { StockPage } from './features/stock/stock-page/stock-page';
import { UnitsPage } from './features/units/units-page/units-page';
import { WeaponModelsPage } from './features/weapon-models/weapon-models-page/weapon-models-page';
import { WeaponSystemsPage } from './features/weapon-systems/weapon-systems-page/weapon-systems-page';
import { ZonesPage } from './features/zones/zones-page/zones-page';
import { UsersPage } from './features/users/users-page/users-page';
import { AuditPage } from './features/audit/audit-page/audit-page';
import { DocumentsPage } from './features/documents/documents-page/documents-page';
import { DroneLogisticsPage } from './features/drone-logistics/drone-logistics-page';
import { RecommendationsPage } from './features/recommendations/recommendations-page/recommendations-page';
import { ReconPage } from './features/recon/recon-page/recon-page';
import { AnalyticsPage } from './features/analytics/analytics-page/analytics-page';
import { HomePage } from './features/home/home-page/home-page';
import { NotificationsPage } from './features/notifications/notifications-page/notifications-page';
import { PlannedTripsPage } from './features/planned-trips/planned-trips-page';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPage,
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'home',
    canActivate: [authGuard],
    component: HomePage,
  },
  {
    path: 'map',
    canActivate: [authGuard],
    component: MapPage,
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    component: NotificationsPage,
  },
  {
    path: 'service-orders',
    canActivate: [authGuard],
    component: ServiceOrdersPage,
  },
  {
    path: 'units',
    canActivate: [authGuard],
    component: UnitsPage,
  },
  {
    path: 'fire-positions',
    canActivate: [authGuard],
    component: FirePositionsPage,
  },
  {
    path: 'weapon-systems',
    canActivate: [authGuard],
    component: WeaponSystemsPage,
  },
  {
    path: 'weapon-models',
    canActivate: [authGuard],
    component: WeaponModelsPage,
  },
  {
    path: 'depots',
    canActivate: [authGuard],
    component: DepotsPage,
  },
  {
    path: 'stock',
    canActivate: [authGuard],
    component: StockPage,
  },
  {
    path: 'stock-movements',
    canActivate: [authGuard],
    component: StockMovementsPage,
  },
  {
    path: 'drone-logistics',
    canActivate: [authGuard],
    component: DroneLogisticsPage,
  },
  {
    path: 'planned-trips',
    canActivate: [authGuard],
    component: PlannedTripsPage,
  },
  {
    path: 'fire-missions',
    canActivate: [authGuard],
    component: FireMissionsPage,
  },
  {
    path: 'air-threats',
    canActivate: [authGuard],
    component: AirThreatsPage,
  },
  {
    path: 'ew',
    canActivate: [authGuard],
    component: EwPage,
  },
  {
    path: 'air-assets',
    canActivate: [authGuard],
    component: AirAssetsPage,
  },
  {
    path: 'shells',
    canActivate: [authGuard],
    component: ShellsPage,
  },
  {
    path: 'charges',
    canActivate: [authGuard],
    component: ChargesPage,
  },
  {
    path: 'fuzes',
    canActivate: [authGuard],
    component: FuzesPage,
  },
  {
    path: 'primers',
    canActivate: [authGuard],
    component: PrimersPage,
  },
  {
    path: 'shell-compatible-charges',
    canActivate: [authGuard],
    component: ShellCompatibleChargesPage,
  },
  {
    path: 'shell-compatible-fuzes',
    canActivate: [authGuard],
    component: ShellCompatibleFuzesPage,
  },
  {
    path: 'zones',
    canActivate: [authGuard],
    component: ZonesPage,
  },

  {
    path: 'analytics',
    canActivate: [authGuard],
    component: AnalyticsPage,
  },
  {
    path: 'recon',
    canActivate: [authGuard],
    component: ReconPage,
  },
  {
    path: 'recommendations',
    canActivate: [authGuard],
    component: RecommendationsPage,
  },
  {
    path: 'documents',
    canActivate: [authGuard],
    component: DocumentsPage,
  },
  {
    path: 'audit',
    canActivate: [authGuard],
    component: AuditPage,
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    component: SettingsPage,
  },
  {
    path: 'users',
    canActivate: [authGuard],
    component: UsersPage,
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
