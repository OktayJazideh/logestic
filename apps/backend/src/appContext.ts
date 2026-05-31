import { AuditLogStore } from "./stores/auditLogStore";
import { OtpStore } from "./stores/otpStore";
import { SessionStore } from "./stores/sessionStore";
import { UserStore } from "./stores/userStore";
import { AuthService } from "./services/authService";
import { MineDataStore } from "./stores/mineDataStore";
import { MissionStore } from "./stores/missionStore";
import { FinanceStore } from "./stores/financeStore";
import { EntitiesStore } from "./stores/entitiesStore";
import { SettlementStore } from "./stores/settlementStore";
import { HourlyWorkLogStore } from "./stores/hourlyWorkLogStore";
import { DispatchService } from "./services/dispatchService";

export const appContext = {
  otpStore: new OtpStore(),
  userStore: new UserStore(),
  sessionStore: new SessionStore(),
  auditStore: new AuditLogStore(),
  authService: null as unknown as AuthService,
  mineData: new MineDataStore(),
  entities: new EntitiesStore(),
  mission: null as unknown as MissionStore,
  finance: new FinanceStore(),
  settlement: new SettlementStore(),
  hourlyLogs: null as unknown as HourlyWorkLogStore,
  dispatch: null as unknown as DispatchService,
};

appContext.authService = new AuthService(
  appContext.otpStore,
  appContext.userStore,
  appContext.sessionStore,
);

appContext.mission = new MissionStore(appContext.entities, appContext.finance, appContext.auditStore);
appContext.hourlyLogs = new HourlyWorkLogStore(appContext.entities, appContext.finance);
appContext.dispatch = new DispatchService(appContext.auditStore);

