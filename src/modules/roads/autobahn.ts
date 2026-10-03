// Automatisch erzeugt von tools/build-roads.py --autobahn koeln hamburg. Nicht von Hand ändern.
//
// Quelle: Overture Maps, Release 2026-09-23.1, Thema "transportation", Segmente der Klasse motorway mit A 1
//   (routes.ref), kürzester Weg von (6.897, 51.0) nach (10.04, 53.505), vereinfacht auf 50 m.
// Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/). © OpenStreetMap-Mitwirkende, © Overture Maps Foundation.
// 269 Punkte, 409 km.
//
// Format: Punkte lng, lat im Polyline-Format (1e-5 Grad, Abstand zum vorigen Punkt, siehe decodeInts in graph.ts).

export interface AutobahnLine {
  /** Städte an den Enden (Richtung der Punkte). */
  from: string;
  to: string;
  ref: string;
  meters: number;
  points: string;
}

export const AUTOBAHNEN: readonly AutobahnLine[] = [
  {
    from: 'koeln',
    to: 'hamburg',
    ref: 'A 1',
    meters: 409384,
    points:
      'ecbi@}xgvHan@cXmhBceAu}Biv@a{CgwAqq@aDm{AtDms@uFuuCuq@a_B{Si|Bii@}zCsfAicDe]cgAaQae@iPiYkWo~@u|AaJ}|@cn@go@_q@sZ_{B_a@ib@iOiZkX_Tmj@a{@cc@c]sc@a~B{f@o`AoiAaIm_@vGulB{KuQkiAsaAeI}R}@wVzF{TjSyUviBqbAYgt@l`@ks@tBmXkTyZ}|@c_@s]gUuj@kQiUi[_^wW{B{OvOuaAaZsi@cLwz@qRaZ_}BmdAcs@gOaiBkVamAgq@{~CuoAyoAaTsu@kd@_yA{RoeAoTaiBao@_pBqj@yVuQkd@qdAud@qX}kAkScaA}VwiC{]ieAiZ}}AgcAym@kSaRsLuk@qhBcZyYy_@oMqmFybA}}@_Xg_@gTso@{k@m~Agg@uh@}e@wmBonA{PyRao@kfBu[odCeQmnCgV}f@ut@go@{a@uj@uc@okC]}a@vVotAt[unF|^}qAdnAeuBvn@g~Api@kfDxn@g_CpRseCvX_eAna@ip@x_Am~@~vDoqCbb@mg@l]cu@|Ni}@W}_B|Jg{@dgB}lEz{@cpD~ImsAaPodAig@{~@odAmbAmu@u_AeiBouAyc@{c@qpBamDqnBkhCmr@}l@}mAuq@suDsqAs_Biy@abBksAoyBsmC{y@mw@{~@ik@koDuaBoxAklAme@gY{zAah@__BoWszBeTsj@{Mgj@uVab@c^oj@kz@k\\sWah@kVycBih@y{@em@geCc}DoZ}{AqPkb@qXia@ue@mc@on@o^mw@oYsnByc@cuB}\\ah@iOw_Asj@iy@_z@of@k_AkLa}@|F_r@nt@a|BtO{|@k@sqAmX_uAiz@{iBa|AozBu_B{eBekDozCmn@u_AuMwk@oEwcAdZmdEoA{h@kLmp@cn@anAclEc|E{p@ieAw_@cz@oYkbAiNubAkBk_GsV}iBw^gdAy|Ai_Dmi@ivAobBciH_t@epAkpAynAysAmw@ssAod@cgAmRmeCcQg_A}Loz@iRuvC}~@wzBub@ypA{NujBwKajJgNimAoJsaAoOchAw\\a_CumAkwAch@e|Ag^s~F{~@{|Bwe@scCmv@suFo}BekA{[mbAgQenLcbAglDqi@{pAsMecBwGutDW}n@uCcm@uKokCky@coA{O}s@aAky@rD_y@vMefAp_@oc@pJ_t@hF{x@sA{w@gMioBgv@yhE{iAko@_FghDsE{aF}VscAcJq`AoPeuKqlCedAya@czDoiDu~AmzCo|AyfBeaAe|@otDm_CegEacCgyAyjA{|@ah@eb@qMu~A_YcuEq[gnAqSq`C}u@u_JokEis@{PuyFy|@qpKskD_nAaZa`YmfFmnAuQe{TkVa~CnJo|Owv@o}CuHcnAnIuZ{AsTuPo@qWg`@ikAeZylBoYe~@p\\w{AvE}x@zg@yjD{GgSw}A_xB',
  },
];
