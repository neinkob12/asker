// Automatisch erzeugt von tools/build-roads.py --autobahn <a> <b> bzw. --autobahn all. Nicht von Hand ändern.
//
// Das Autobahn-Netz zwischen den Städten (Auftrag 36): je Linie der kürzeste Weg über Segmente der Klasse motorway mit
// den Nummern in refs (routes.ref; andere Autobahnen zählen 3-mal so lang), vereinfacht auf
// 50 m. Quelle: Overture Maps, Release 2026-09-23.1, Thema "transportation".
// Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/). © OpenStreetMap-Mitwirkende, © Overture Maps Foundation.
// 8 Linien, 2644 km.
//
// Format: Punkte lng, lat im Polyline-Format (1e-5 Grad, Abstand zum vorigen Punkt, siehe decodeInts in graph.ts).

export interface AutobahnLine {
  /** Städte an den Enden (Richtung der Punkte). */
  from: string;
  to: string;
  /** Name im Spiel (die erste Nummer). */
  ref: string;
  /** Alle Nummern, über die die Linie läuft. */
  refs: readonly string[];
  meters: number;
  points: string;
  /** Endpunkte und Punktzahl (zur Nachverfolgung). */
  source: string;
}

export const AUTOBAHNEN: readonly AutobahnLine[] = [
  {
    from: 'koeln',
    to: 'hamburg',
    ref: 'A 1',
    refs: ['A 1'],
    meters: 409384,
    points:
      'ecbi@}xgvHan@cXmhBceAu}Biv@a{CgwAqq@aDm{AtDms@uFuuCuq@a_B{Si|Bii@}zCsfAicDe]cgAaQae@iPiYkWo~@u|AaJ}|@cn@go@_q@sZ_{B_a@ib@iOiZkX_Tmj@a{@cc@c]sc@a~B{f@o`AoiAaIm_@vGulB{KuQkiAsaAeI}R}@wVzF{TjSyUviBqbAYgt@l`@ks@tBmXkTyZ}|@c_@s]gUuj@kQiUi[_^wW{B{OvOuaAaZsi@cLwz@qRaZ_}BmdAcs@gOaiBkVamAgq@{~CuoAyoAaTsu@kd@_yA{RoeAoTaiBao@_pBqj@yVuQkd@qdAud@qX}kAkScaA}VwiC{]ieAiZ}}AgcAym@kSaRsLuk@qhBcZyYy_@oMqmFybA}}@_Xg_@gTso@{k@m~Agg@uh@}e@wmBonA{PyRao@kfBu[odCeQmnCgV}f@ut@go@{a@uj@uc@okC]}a@vVotAt[unF|^}qAdnAeuBvn@g~Api@kfDxn@g_CpRseCvX_eAna@ip@x_Am~@~vDoqCbb@mg@l]cu@|Ni}@W}_B|Jg{@dgB}lEz{@cpD~ImsAaPodAig@{~@odAmbAmu@u_AeiBouAyc@{c@qpBamDqnBkhCmr@}l@}mAuq@suDsqAs_Biy@abBksAoyBsmC{y@mw@{~@ik@koDuaBoxAklAme@gY{zAah@__BoWszBeTsj@{Mgj@uVab@c^oj@kz@k\\sWah@kVycBih@y{@em@geCc}DoZ}{AqPkb@qXia@ue@mc@on@o^mw@oYsnByc@cuB}\\ah@iOw_Asj@iy@_z@of@k_AkLa}@|F_r@nt@a|BtO{|@k@sqAmX_uAiz@{iBa|AozBu_B{eBekDozCmn@u_AuMwk@oEwcAdZmdEoA{h@kLmp@cn@anAclEc|E{p@ieAw_@cz@oYkbAiNubAkBk_GsV}iBw^gdAy|Ai_Dmi@ivAobBciH_t@epAkpAynAysAmw@ssAod@cgAmRmeCcQg_A}Loz@iRuvC}~@wzBub@ypA{NujBwKajJgNimAoJsaAoOchAw\\a_CumAkwAch@e|Ag^s~F{~@{|Bwe@scCmv@suFo}BekA{[mbAgQenLcbAglDqi@{pAsMecBwGutDW}n@uCcm@uKokCky@coA{O}s@aAky@rD_y@vMefAp_@oc@pJ_t@hF{x@sA{w@gMioBgv@yhE{iAko@_FghDsE{aF}VscAcJq`AoPeuKqlCedAya@czDoiDu~AmzCo|AyfBeaAe|@otDm_CegEacCgyAyjA{|@ah@eb@qMu~A_YcuEq[gnAqSq`C}u@u_JokEis@{PuyFy|@qpKskD_nAaZa`YmfFmnAuQe{TkVa~CnJo|Owv@o}CuHcnAnIuZ{AsTuPo@qWg`@ikAeZylBoYe~@p\\w{AvE}x@zg@yjD{GgSw}A_xB',
    source: '(6.897, 51.0) nach (10.04, 53.505), 269 Punkte',
  },
  {
    from: 'koeln',
    to: 'frankfurt',
    ref: 'A 3',
    refs: ['A 3'],
    meters: 172392,
    points:
      'gh~i@iu|uH{lBllBo[|OajAtQkqAdAqxApS{V~GsaAlf@uuHbtA}n@pc@k{Alt@sc@ns@}zAv~@aYf^eAnXlJdRb{@fx@tEtRx@tu@cHjQsnCnuCw`BbvBjC~\\~aAxcAvKnc@oFpZwq@bsAcCv_BkUxlAig@zl@uuA|v@woBlnBiVlKasA~Zoi@pX_kA~_@kqAtwAg\\vUuiBrr@adDtd@cv@th@yV`JagEnz@yTdPi\\hz@eMlMkdAlWwnCrsAk]dGipAlFg|@xZw~ArUmmBns@ao@jOw{@dI{qBhEok@jK{nAdo@wiAlkAgbAbk@wj@tR{w@`M}lA|EceHeEgp@fHkUpLwb@`a@ayA|o@cYdHuu@bGmXxK}_@xv@e~Avq@k]tU_RbWij@l}Aeu@|b@g^pd@iX`MksCzR}hBkEckCc@aa@}Fqo@g_@o`@oIkjA}AqaBpF}i@hL{}@p]{VfP}MlRmRdo@wl@vh@eM~z@w`@jUk]tC}w@{DasFhFod@pFomAr^ui@hIo|GbFkqAlYcYbRgs@xrAcVpQiaHbrBsnCld@ccCxvAuzBbt@ueBxd@ad@`X_eAdwAaq@hcBcHrsAu{@~pAn@jUrXfi@fEjlBsSji@gKno@~Djp@oJjp@aZd{@yxA`sBs}Bjv@cf@pe@md@`Z{r@ft@mQrGqo@tIgm@hf@}_Al}AyNjmAw~AxgDkk@by@qqApbAoeBpqBu^rNigBn^cfFh|@mbDla@gj@nBkz@_J{dIm_CskDea@s`AgA',
    source: '(7.045, 50.955) nach (8.596, 50.055), 147 Punkte',
  },
  {
    from: 'frankfurt',
    to: 'muenchen',
    ref: 'A 3',
    refs: ['A 3', 'A 9'],
    meters: 379683,
    points:
      'qqrs@yxnpHur@_DsuCgi@em@gFirFuAu`CaScnCt@k`EoQquH{AomDfe@{iHxXi|@nKqt@|Omt@lYec@x[oTl[ma@jcAwd@f_@}nLl}DarA~Y_sAnD_cEoWiaDjAkuByUkv@iD{z@xAa}BjU_sAvAoaAgIslCil@yiAmOc_AJeoAhOkbAf[qm@bu@eiAbl@}bBtf@yw@zOaeArj@_dApOmZfL}k@hi@}hBdpAin@zt@{N`o@qL|S}pBlxAeyAfa@{z@ph@eiAbQ{kAzj@q`Bb\\s_Bpz@_o@nL}gAbGk`@nJml@n`@qjA`a@mr@z|@_k@`_@oiBdh@quA|x@ghC`h@_zApj@o`@~^sBl]`PvVtp@`[jUnU|Hd\\oGv]{RrTea@fQkpAbNsqArVctCxLi|@_@{vBs[}r@wDs{BkB{lEwl@up@sA_wBt\\cmBbF__@`Fk[~Nop@xt@{d@|[cn@vUer@dLkk@z@s_BeKsy@u@ckDnSqq@Xow@iGsbBqa@m~@eKku@OaqArN_d@nA}g@cCyr@eNs[}AmZrDaQxImZjv@mTtQci@hJicA|AkpCaMobBsXinB}q@skBwjAucBeu@c|B}j@esBoUweEcCidCcSsp@a@el@hFizBb^miBlJy{CpBg|CiPcgAVo|@lJupBdc@_nAbGuaCcHgaDxF{iAyBkgAgMedC_m@yfAoGsg@|Bac@hHobCp`Ayx@rOgeChKgiDnZkqDzHg`CrUgaCyEg{@`E}h@vLsoCzhAwd@dJ{}AdP{xA~j@{t@jLgwHBgnGid@wnBcFkw@|@qs@pFuj@`Lgf@hRmdArq@sxAvt@ee@n]el@nt@wo@v~Ak^~h@yw@~q@icBtcAm`C``CoSd_@uXrkA}k@dwAyAnb@rIjlAqHrk@{Zvl@oo@ni@qt@zZm_AdQ{}@~EwiCrAo~@jMgk@rWos@nu@il@`Zc{EpaA{fEbdBcjDpm@qfCfv@irDfxAwkBpuAs\\hO}}@tKchBuHif@xAun@lNcb@f]{C~WnKhWdgFpzEfPfX|D|VqBjYid@xoAtIvgAyk@xoKiJvwE}x@`tFov@~yCknEf|F}{@ldGke@viAoQ`~@kW~i@e`@t}BcNd\\we@h`@czChnA{p@zz@sx@rj@y{ApZkSbKgYli@{^|`@oDtOlKbXtv@~b@jJrMr@rT{O~^yTxLelAlTqm@rVcyAd{Amc@~t@uT~Ki}@rOe_@zOs_@|W_q@`u@mfBjz@mnAl}@ob@|n@iNdt@q@b~@vTtjAhCl}@sKpt@bT`fCsD|^uh@z_BuB|Uff@fuAfFbcAf`@|bByCt}AxTtaBY`[qLr[wzBvcDunAxiDe`B|pC{Qhi@aWjyA}v@`cB}Hdp@uIzSwV`Uix@f_@{dEp|Ck`@xPyhAzW{UdWD|t@lWreAi_@n}@_I~eAfI|Tvv@~s@xJba@mGtl@gv@l`AqJd^xDx\\dm@reAfGhY}b@ztBrI~zAsBlmF}EvW__@bo@qFrWrLhoCwE`a@oeGbgMmu@|rCdBhn@bhAzqC',
    source: '(8.596, 50.055) nach (11.6278, 48.2183), 296 Punkte',
  },
  {
    from: 'hamburg',
    to: 'berlin',
    ref: 'A 24',
    refs: ['A 24', 'E 26', 'A 10', 'A 111', 'A 100'],
    meters: 272196,
    points:
      '}ip|@_m|eIeaG}Y{o@a@cl@~Dk_Cl^c{AN_eBzRyjAzCs`CmGomHkm@_jE{Ms}AfFiqCha@co@zEkv@\\cqCaMiiE`PubAv@ewAkEobJwq@kqBqA_eAxGgjCh\\y~BzLykBhWwqBxHcuB`TuxFRe{CjNkkAdPk_Etz@gcG`u@soIlrAe}AnNurAnDi~GnB_mE_Fo`E~GwvR~fA{hFhKo}ElSo{Jtq@olBb@cjDaNmuBjFseBbUswCnz@_hCha@u{@hSw_A|]ayD`pBgeAh\\}kAxU}tAhOucBlGmqA]kcD{Ja~BxEmqBtTgbCpj@g}Bl^qkAr]wzBzhA_qChw@apBn`AuiBrf@m_AdM}dAzGqfJ`EqvB`NspApUccB~g@{w@pPsdAjM{oD~UaqCdj@miDvg@ay@fUgv@n[}mC|}Amz@jZsrA|YkdAtM}kAbHqdJzDymBpHeuBhPcwBv^avBxt@}cAbW}dFfs@shAjTauBfo@{oDbmBupDvgAifGfhCkaAbh@_sAlaAuyAdn@omAtX{s@|JmsExVosBxXyvAjb@qhBrcAigArc@smAbYedCnUu\\xKmi@lqA{p@|s@wx@jc@a}CbhAggAzs@ei@zq@in@rcB}e@zr@ag@x`@a`C|tAkiBrwBqfEvdDqhBpmB{|B|lA}oBjqAot@pWkrB`h@mo@nWowBh~A__B`|@ic@h^c^zh@_lBrjEeb@pj@}rAhoAu_@~n@gLxn@_C`{Cq[~qAy{@jjAs|AbaAy}@p\\gnAvYqzFvp@qtA|V}lAv]czD`{Aku@zQmx@xKugF`YevIlw@ycApFizA^evCyMoeAiA_aErIunGAmb@~IodAppA{fD`hBst@xw@{N`d@wBf]lUhtCeJhQ}e@`\\sAfLcN~Kf@bFfRrKI~HaMnHg}DbhA}Yh[ihApkB_p@t\\kHrd@oW~RwAz`@zlAhxAna@p}@zj@nSvPpSnHnWwDzT',
    source: '(10.065, 53.562) nach (13.275, 52.505), 184 Punkte',
  },
  {
    from: 'berlin',
    to: 'muenchen',
    ref: 'A 9',
    refs: ['A 9', 'E 51', 'A 10', 'A 115', 'A 100'],
    meters: 561219,
    points:
      'gq_pAkzl_IhwNdtK|Lxn@cZd[eKdw@pBxNfhBt{Aj[rJhdBbXxZhPn\\vn@zBzdAxk@ja@dIxNYlhBnHrSvMvLvX~K|eCbf@`ZpKrnAfjAhr@rkArb@dQ|o@zAvxC_Df_A|N~Wl@xhCm_@rtEB~zIjlA`YfHzL|Obq@b_DeFb^yt@x_Bp@bn@hUh`@v~DvoDps@jYzwAtTnb@`LpdBnhAtd@jRh~E~u@hr@~Sh_HptF|gDllAjlBbjAbqA`k@bvAl}@~u@dt@jqAxxBz_@`]~hBbq@~r@|l@~cAbT`cAlp@~vCj_Ax}AjjAp`CftA~eDt|@deDzm@b{Bhz@hd@tf@~sAjcEnXz_@bXvPblCtiAncCluCva@d\\vf@lSvyAp^b}CbcAbp@p\\|Yb[`w@buAlcBrbB|fB`cAjlBtiCr]jUjvCzrAbaBvwBrV`g@vK|c@~jBhnP~gB`mGuAh[sl@xlBBvXbVh_Biz@`lDmHjqBg^bpBkaA|bBqQ|xA|Kls@`rExsJQtc@qs@vgDvShpB`fAngBpzCdkDtjBlvAnaCzxAppF~jCvaFnaFleBnsAtgCv}DxmFrnGnRj`@|Fz`@tA`aGxFfh@bjAr~BlOftAx_Dr`Gha@nYx[dLxlEft@xV|HjT|Qp_@`y@tmBtr@rOjNpXbi@we@`~Cqn@r~Goj@dmBsw@xxAqxAnlAih@x_Ao}@|v@}CzOn@p}BvN`]`{@jd@bMpM~MhcA~HhPjaBfnArlAfdBrEvc@k`@heA`Cte@j~@ldAvqBx|C|u@h{Al_Atv@`QpU~t@joCvMxgBpeBh`EaJda@wlApy@oYx|@ax@zk@qRbc@fCnc@`a@zq@lGjeAjYzb@zD~RqKz\\au@d_@}NzVvWbdAkLhm@p@zXzZriAiY`zAj]ju@p^|^nWjc@lx@td@`h@dy@hs@xOdL`VqLvc@w_Av[e\\|\\sv@v^_NtR`An_@px@nw@xEj\\ef@nu@pCrx@g]bwAsi@jp@woAdzC}Ej_@jFn_@ftBbzD|eAtz@dQbU~D|e@e[dv@iCt\\|EdZ`c@tfA~_BnpBr_A`{@hTp[bCf]gUlv@i@jQ|f@lgAtFd~@hOp\\f^lWn~CbqAhUnRhh@dt@~|@rj@bkEfwAnrA|LbjAdSpu@lb@lPdStMt_BpP~a@be@tp@`UnrAkQr{@kTf`@bW|o@sEnkAnNffCqNvmAl`@dgCwQ|kB~L~~@za@nvAtPjPjSrIre@lGpoC\\lj@jCxa@zIrp@h`@`tAdHfc@pMbVt[pCv{@pF~R`}@vt@pOfTbYn_A~Btb@`Mlb@cThfAvGdOl_@r[tDjUeRjZwjA|YsY~ZL~Xt\\zc@hJnl@gRvb@mB|Zwc@llBAnQvWvd@pUnOpgCz`@hZdJ|vAdxAlMfj@iWnvDjKbc@tyAnhA|WfG|l@jD`YnJp[jd@j\\pTnh@~l@tlAn}@vfBzb@jnBtWbZxPhk@vr@ddA~[b^jc@|PjbAzmB|mB``ArhEtRd_@~iBteBz~@~p@|rBz|BnsA~bAfdAphAj[`Tha@bm@tsC|eCb|@b|@~MpXLhl@yd@`tAdJncAyk@xoKiJvwEmu@zhF_z@deDknEf|F}{@ldGke@viAoQ`~@kXrl@ue@|jC}O~U{XzSu~C`qA{p@zz@qt@`h@qYhKieAxP}VxNuUve@{^|`@oDtOlKbXtv@~b@jJrMr@rTqQp`@sWzLurA`Wqb@jRcyAd{Amc@~t@}Y~Mg`AxP{ZnOw[bU_q@`u@mfBjz@mnAl}@uWtZsKbXoLho@q@b~@vTtjAhCl}@sKpt@bT`fCsD|^uh@z_BuB|Uff@fuAfFbcAf`@|bByCt}AxTtaBY`[qLr[wzBvcDunAxiDe`B|pC{Qhi@aWjyA}v@`cB}Hdp@uIzSwV`Uix@f_@{dEp|Ck`@xPyhAzW{UdWD|t@lWreAi_@n}@_I~eAfI|Tvv@~s@xJba@mGtl@gv@l`AqJd^xDx\\dm@reAfGhY}b@ztBrI~zAsBlmF}EvW__@bo@qFrWrLhoCwE`a@oeGbgMmu@|rCdBhn@bhAzqC',
    source: '(13.275, 52.505) nach (11.6278, 48.2183), 398 Punkte',
  },
  {
    from: 'koeln',
    to: 'rotterdam',
    ref: 'A 3',
    refs: ['A 3', 'E 35', 'A 12', 'A 15', 'E 31'],
    meters: 273742,
    points:
      'ca|i@sbbvHlO}`@haAso@jYki@fAqXuMeaBjk@eeElT}[pjA_z@jVgr@qAm~CzCk`ClFmXzbAupAb~@wdDpvA{tBnjBo_EhrC_|DrCu^}\\qbCC}XnL__@t_AukAzMoZzVoqAoPmoAzFqg@dYi_@zuDykCt]gOneCyq@lh@k[|q@mkA`d@i_CtQkUfjAy{@b^_aAyCkZot@um@mKc[lIcZpm@oh@Xul@{QaZay@sYiWcWqEmb@dRoy@NuUuz@w_CfC{Svk@i{@jAoc@yNuWyp@ag@so@oS}Ck@iEw@aEo@kCSwErArGdC~Ac@bD_BlCuAxBeA|Bo@jJcFdxBi`BdrA}}BnvAkrApI}ZnEiz@rMy[ptDqrCxrAczBphAugAbaBu{Abh@mYxnCcn@|]oPnr@mg@j_@_Ope@sIjmBwQxbAy[`i@{f@j{@ecC|g@eg@fo@oS`wDgh@xxDclBx`AuYrxBwf@tf@iZ`z@}kAzj@yZb`IagBt`AaKvmDwRvt@}JpcH_hBdp@iFpwB{Fxy@_JppEkuA`p@kF`iEaKxoAyNhkAiWhaAy]jz@ue@bdDcvCfjL_oE~mAeb@jiDau@`_HmoAbc@aPn_BcfA`{Byk@fk@qb@hq@utAx`@uWp]qLdj@uIjcFib@xbC}a@f`AsJpuAwBllC`OvTmE~JbAhMjy@f`@pu@|WdYps@h^lrC|y@fw@za@~UnXUl_@{Zr]qFzObAbPlWpj@jAz\\sp@zzExFr^dS~LxZRl`AaW|v@yHd{Cj@ljEsH~fMmc@jf@`@rcCdQ`xF|ClaB}JhgBl@hkAxKp}C~~@zbD~f@d_GnOzmArMriFjiBlgDttAffE|l@nyKfG~v@hIn{Ax\\bcCbTxgB{An|DfG|pCsBzl@vEjpCzc@~p@zFpkEGvpEqMfcAgHhr@qK|fAgGleEbCbg@rFh|Afa@d{A`AnxAlLz}A|V~lCfn@|}BpGxmA`NrpAnBfg@}BvsB}XvwGa^~~HgmAh_B}d@bgAwe@p_@iHjoBg@`|BbEfzC_B|iCkoApZsVfQ}D|XzAtgBbm@h}@hOvv@`A`mAkHvbAkAj|EzU',
    source: '(7.045, 50.955) nach (4.45, 51.87), 212 Punkte',
  },
  {
    from: 'rotterdam',
    to: 'antwerpen',
    ref: 'A 16',
    refs: ['A 16', 'E 19', 'A 1', 'R 1', 'A 15'],
    meters: 89414,
    points:
      'kjhZsgp{HqhFeVciC~Jen@Kgw@oJyiBif@_f@^sdAj]si@rWuLxIaLdWud@|OmcCzeC{aAbiBo`@`Psu@lMgV~NaG`SbHhkAyI|}@bBfa@j]zoBzlAtcDjBrn@yn@hrAyt@h`Au_@bw@ulCtxCgmGbbKyWzz@Rxz@yFbd@wvAltD_IfvA}ZtsAgBvj@xRnqB~sAbfD`xAdwEdbAhjCf\\zd@nb@z_@thD||B~wHpjGxy@zj@leBzy@`iIxxCleBpw@th@h]~bAvdAbd@~X`l@bQpd@fEpzBwGr{BzIj|@dVhh@zd@',
    source: '(4.45, 51.87) nach (4.42, 51.24), 57 Punkte',
  },
  {
    from: 'hamburg',
    to: 'frankfurt',
    ref: 'A 7',
    refs: ['A 7', 'E 45', 'A 5', 'E 40', 'E 451'],
    meters: 486012,
    points:
      '{lq{@iwieIgQbSmCdU~GxRzd@db@rJtRl@dYeM`Ye^|Ugm@tRwtDjq@_iAji@yhAnvA{iAr}@eb@xaA}QnUij@xZycBhf@mZfSsMvYmN|kC_Ll^w]l]{|BzwAyXd]omB||HdFrn@bv@zfBdNzz@uUtsCeXnhAlDvk@fWxj@r\\pc@hg@~c@pg@pYvhA|^`sFpdAx|@t`@zm@tj@tTvc@lZjmAlnD~kGnx@`oEroBjiDjDz\\k@xlBhIdYbVbYrtJbjFxw@lWtjFfsAjgAtb@`iC~lB|kCbsAp|CvvBd}@l[vsCbo@`^zOxXtT`b@jw@rYj`C~jBn_I|DddAwN|y@a|@noBo[~bAacA~gG}]ddAmj@jiAeuGz{I}q@rn@yxBbxAyu@jw@itAhjCm~Ab{BmmAvkCyc@zh@whBjaBkc@pk@ySlk@cLlcAoOl]wcC~zBc~@pxA}Sdt@yI~|@nAnx@|Nf|@tSxx@bRh^diBzvAfe@ll@nUpy@Sly@uOtm@gg@|t@ek@xc@qbCbuA_|@|bAsr@j~BqnAzgCcIxl@gDzdBoR~i@aq@|j@}pCdnA_r@de@gc@hn@cgAxjCeXxYii@~Y}{@jT{yCz]qsBbj@cu@xLuuA`HalDj@aoAhOuc@xOqdAbo@u`Abd@{}Blq@ck@dUiz@`j@ud@bm@wLrq@dMt|@zXli@jnAn|Arg@rbBdbAdjBd_@fmCp|@luAlKtYnAbf@k]fxAy@fk@lLlf@ha@vq@bPdf@~RzdCpZjnBjKnbBx[l}AhnAfxCz[j\\ffAnr@nr@zv@zu@xVx}AnKbp@`JtsAla@xd@dZtq@fbAd|@xy@~f@ptArThVxi@bQrjBxOloCtt@d}@~b@xe@~h@tOnf@~ItoAdt@zy@fNzq@|_AdxBc@nQkc@vvA~Fpz@hfAblBf]reBmGf`@oh@jt@e@hZ~QtX|c@lYd]nJrmAdNzW`NdL|PvJ`|Kbr@dwEdTji@teBdiBne@t{A~RvYv[jT`xApl@rcG~oAd^Pl_@sE`{Cu}@j~AwI~cAhIhfCzv@xd@jAlkAiIh]hDdZvJ`XnT~u@lzAjQlQ`ZrLnfDpu@~XfKtmBjjBf~E|yC~]x}@qPzaAbI~[tQhNruFnmCzKpXaDpsAhFtPhyAhv@ryBftAl{A`mCdAjZsi@b}AtClfAmt@hxAxCnSx\\ld@vNbxB_IzRuj@x`@{MrWjItz@oM`i@~Kre@{KpjAs^|}@iZhjAmObkArF|UneArrAq@xT}Zdg@dCn`ApMzUju@dd@dQnUdRb~@a@js@gI~Yg_@~YmG`a@kc@j[ca@tLer@lHio@~Wc`@fXuz@zWudAxCy]fIeSzR_RbfA{HlLe{@dXqa@~W}hAfe@ez@pUiQdOc@fWjd@zl@j@dVoZpTsv@xDwVfHkWtXiAfXrElLfZ~UrY`g@pt@rkCdiAxwBrOhLv\\~Jrw@GjVrD~lAtq@fS|FnnAfFlu@aDt[fDzg@vQfk@~^n{AvU~bAp_@jZ`@xz@cPzZWpaAb]jtF~v@zp@pZb`Bhh@~b@n\\z\\bLz{Dhj@|ZKhwAsMbw@~D~e@zPvg@`i@pW|Lp\\fEvfAnBv`BvWneC~VvlAtc@pmBre@`~Azv@vZdI`\\lAhv@uDjtB|Evh@aCb}A{QrhBiB|nAnEd`C}Nns@xEj|Afp@b|@bYh`@dUja@|h@~Urs@bi@nb@rsAnbCf\\nV|bBlz@xbAzN~}AzLvnDlNh|FvoAvrE~kA`g@rCpnD@`_@fFtWlLpv@x|@zh@tqAn\\ld@fRrk@zrBvhDv~CfxCboAzzAryCl}Gnc@h_@d}Avk@fTdX|@pRqdAlaLhIl\\fv@pdAvK~Yh@n^mSteAvZ`xBvQr[`dAt{@jPjUvhAdsExBr{HpNnZ`ZnW`gElsBt_@~YzoDl`I{Cxc@qdA|jBsWz_@cp@nk@{Q|`@kEfaAdq@~fB',
    source: '(9.921, 53.46) nach (8.596, 50.055), 379 Punkte',
  },
];
