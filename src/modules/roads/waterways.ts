// Automatisch erzeugt von tools/build-water.py. Nicht von Hand ändern, sondern das Skript anpassen.
//
// Quelle: Overture Maps, Release 2026-09-23.1
//   Overture Maps Foundation, Thema "base", Typ "water" (https://docs.overturemaps.org), abgeleitet von OpenStreetMap.
// Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/). © OpenStreetMap-Mitwirkende, © Overture Maps Foundation.
// Mittellinien mit subtype river oder canal, kürzester Weg über Wegpunkte im Hauptfahrwasser, vereinfacht auf
// 30 m (in der Stadt 8 m), jeder Punkt höchstens 300 m von der Linie.
// Rotterdam – Köln: 306 km, 443 Punkte.
//   die letzten 3 Punkte bis zum Liegeplatz von Hand (Hafenbecken haben keine Mittellinie), alle in einer Wasserfläche.
// Nordsee – Hamburg: 104 km, 61 Punkte.
//   die letzten 1 Punkte bis zum Liegeplatz von Hand (Hafenbecken haben keine Mittellinie), alle in einer Wasserfläche.
//
// Format: Weg vom Meer bzw. von Rotterdam bis zum Liegeplatz, Polyline-Format (1e-5 Grad, erster Punkt absolut, dann
// Abstände, wie ROAD_APPROACHES in network.ts).

export const WATERWAYS: Readonly<Record<string, { name: string; km: number; path: string }>> = {
  koeln: {
    name: 'Rotterdam – Köln',
    km: 306.5,
    path: 'u_~Yq_x{Huw@uCkm@n@opAnKoh@nBwf@V{\\kCk_AmPkMmEe_@eW{YO{ZwJsuAqm@gS|DeS`ImShTgKjn@eH|HuHvC{UnDeZc@ouAkT_~@aJ_qBlIiy@`IqgAvk@eQpF_zA`R{o@zDcStOuRlQqcA~xA}f@bRym@j]i_ApdAuMl{Aa[xb@qUvEkMjp@eq@lD}QM_wBgNgn@YumDrFuPiC}R@aJxDkq@pDqvA~_@ac@lB{pA\\_bAyLcsAoGiuAoCeqCp@izB`HwxBcGcn@wIksB{b@{{@_Jus@yAiaAvBo~G|i@w}CdByzBhO_r@lB{|@mEgbCwi@a^wDql@_Cod@r@yi@fFczBfk@wh@~Ko_@fEeuA|EygBqMkpAwAi~@fKelBnZ__A|Bo`AeEchDuf@glAcHmr@}@gvAmMa_AuMu`@wAgi@Puh@fDct@nOif@fUubAvx@c[|Lsf@xGof@O}j@mHm`@{Om_@iZur@_}@ka@ea@eo@ka@qz@i`@ef@}\\q^id@_f@kmAuc@oo@yx@ks@}`Aoe@mt@}Qgz@gGqkA{BqlCpBelAqEyqAcOclC_j@od@gEk}AwGox@nAwrAzJo{AbBk~Cg@s`AjCcxCnPkyCf@w~@zEse@fG{wAf\\ku@bLk{BrN_|Bj\\siDrS{fAzO}hBri@{`Btq@mbA~]eq@jI_cAn@_JmA{WaMww@s~@gy@kd@mk@eK}fAiJc}Aj@mn@nKyt@hd@{r@nm@ex@bXmb@hBeo@kLm]aT{p@}jAoo@ee@yd@kTyg@kFoe@j@cj@~LiwAzk@k]jEeRFg}@hOs`AfVocBhq@ul@tZm`ApTqz@pFucC{@smAzGqyCle@u\\jH_{Bnp@ic@xFgf@tBkoCr@cwAbDyu@nFww@lLs]dJcmBf{@}uBnf@}h@pUsc@h\\gi@bi@gJlS_TliAog@~kAkd@z[_^fNed@nLm`@nF_dA|FgjC}Kk`AcBo{@nAuUlCoi@lSmQzN{MfWMpb@lMlR|_Apy@rI|NbA`YwInR{L~Lae@vQ{cD|Sea@~Ewd@lKo]zOwWrTc[nh@o[h~AqQhe@kOjQwY|PcZrIcu@vHooAj@_pAeByg@xBykBnTkaAi@uwAyHwc@_@oi@bBof@`Gi`@tLq[bPaXn_@gFhZhDh\\hRhXbj@rWtZhShKfNzEf]yB`Qmk@~gAaTdv@sDlXpEhxAmAnUmNbUgNlJuf@jOsSxBcn@Wiu@oLehAo_@_t@mPw\\oDqx@{@}_@tAa~@rMcSpGoYfU}E`MiBd[tOvg@~e@~q@hI~WdEt]qDdTk^r]qm@~WyjBr_@}^|KePjIcg@z[qLlNyH`RcAbPpAfJnOpYnPjLhb@pLvlBfRxi@lNn^zOlKzIbGzLzAnTcKxTaPvKaU~G_q@pGghA`Da[lDkc@vNgVvT}ItW|B~\\jJ~Njk@nd@dMdUfBxWcBtK}IrS{MlO}tA|s@wgA|y@uRb`@sDzTGxY~FtYlb@nh@tt@fg@~v@n]t{@hTdy@dHts@nAx|AnInsAlTpj@fQnMjKtK`UHxR_KbUkKxJuRjJi`Cd`@s}ApSk~@pRyaAfZml@jViZ`QqUxSkLtU_Cj_@pN|w@bKpPr^h^dmBrxA`Y~WpK|Xm@r\\cI|NmQbPwy@f]{o@`NucDlc@wv@tXuUpPoUtXkFfKcI`h@vL~m@dNpOvUbGpNb@l[aCv_@uMbb@aThk@aMpUm@lTlBn_@tNdEbGjC`Rsq@`fAyFfSWvq@vGtg@{D|UiJrM}[jQ_ZrG_ZjC}[\\_b@uAwd@mE}lAgRw[eAuf@rEgi@pSePrNwI`R_E~e@`E|\\bZlr@hBlOqAnViQhXuRzJqQtEmVhBye@}@ud@qKoQgLku@wy@kd@yWqRwFaPaCk_@e@c`@fFaPjGcPpRe@zNbi@tu@jGzPdFb]uFp]{JlReg@b^}mAjc@gw@jb@iTzXiE~ZvJb[|QtNzl@nSj{@fSnRrGhUnN|K~OxA~I{AjOoIlQkXrRuZlH_nClXcg@bKex@pVqmKdfEsQbJkWhVqJlUGxJj@dKnCfKtWp^ra@ne@hGtQhAxWy@|FiGrU_N`OyEnDbAjLwGzFp@`F',
  },
  hamburg: {
    name: 'Nordsee – Hamburg',
    km: 103.7,
    path: 'myet@eyygIm}B`xA_jAtj@efBht@sbChb@{mClIg|CjCymEkFoqRov@q`BaJcbBcP_uPaoC_pBsNiuNeN_gD|F}_E~YccCvc@k}Cjd@wbDnyA_kFjqCyy@rw@_Xzf@m]jfAmtDzcHsX|P}tCvsAosC|x@qgAjc@shBthAuaApcA{Wly@ae@t|@{Q~e@mv@rlCkN|\\ku@lfA_w@bh@cpAps@qd@xS}|EzaBozDtoBecCtu@ct@tNowHd_@{kLhc@kt@jFi~A`QcfBzSklFjg@e|AlKu\\lB{h@jB{oBjBqaBv@kzEPyGUqUqBm]kGaKaAmNw@m{@_A',
  },
};
