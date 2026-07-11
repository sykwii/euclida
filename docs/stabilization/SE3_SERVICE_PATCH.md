# DroneLogisticsService patch

Inject:

```ts
private readonly droneStockEngine: DroneStockEngineService,
```

Import:

```ts
import { randomUUID } from 'crypto';
import type { AuthUser } from '../auth/auth-user.types';
import { DroneStockEngineService } from '../stock-engine/drone-stock-engine.service';
```

Controller must pass `@CurrentUser() user: AuthUser` to all mutation methods.

Replace mutation internals:

- addDroneToDepot -> `receipt`, destination depot.
- addWarheadToDepot -> `receipt`, destination depot.
- transferDroneToAirAsset -> `issue`, source depot, destination air_asset.
- transferWarheadToAirAsset -> `issue`, source depot, destination air_asset.
- correctAirAssetDroneStock -> `correction`, destination air_asset.
- correctAirAssetWarheadStock -> `correction`, destination air_asset.

After engine execution, return the current target stock row using the existing repository find method.
Remove direct stock saves, atomic update queries, movement saves and `emitChanged` calls from those six methods.
