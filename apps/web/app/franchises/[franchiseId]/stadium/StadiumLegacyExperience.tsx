'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { FranchiseCrest } from '../../../components/FranchiseCrest';

export type StadiumFeature = {
  code?: string | null;
  display_name?: string | null;
  zone?: string | null;
  asset_key?: string | null;
  achievement_code?: string | null;
  unlockedAt?: string | null;
};

export type StadiumAchievement = {
  id: string;
  code: string;
  displayName: string;
  description: string;
  earnedAt: string | null;
  week: number | null;
};

export type LeagueAward = {
  id: string;
  kind: 'championship' | 'weekly';
  seasonYear: number | null;
  awardName: string;
  bracket: string;
  winnerName: string;
  winnerAbbreviation: string | null;
  runnerUpName: string | null;
  awardedAt: string | null;
};

type Franchise = {
  id: string;
  name: string;
  abbreviation: string;
  primary: string;
  secondary: string;
  establishedYear?: number | null;
};

type Exhibit = {
  id: string;
  label: string;
  zone: string;
  summary: string;
  detail: string;
  stat: string;
  className: string;
};

function dateLabel(value?: string | null) {
  if (!value) return 'Permanent legacy';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Permanent legacy';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function trophyAwards(awards: LeagueAward[]) {
  return awards.filter((award) => award.kind === 'championship').slice(0, 10);
}

export function StadiumLegacyExperience({
  franchise,
  stadiumName,
  achievements,
  unlockedFeatures,
  lockedFeatures,
  leagueAwards,
  nextUnlock
}: {
  franchise: Franchise;
  stadiumName: string;
  achievements: StadiumAchievement[];
  unlockedFeatures: StadiumFeature[];
  lockedFeatures: StadiumFeature[];
  leagueAwards: LeagueAward[];
  nextUnlock: string | null;
}) {
  const [view, setView] = useState<'stadium' | 'office' | 'hall'>('stadium');
  const titleCount = achievements.filter((achievement) => achievement.code === 'LEAGUE_CHAMPION').length;
  const rivalryCount = achievements.filter((achievement) => achievement.code === 'RIVALRY_WIN').length;
  const trophies = trophyAwards(leagueAwards);
  const trophySeasonCount = new Set(trophies.map((award) => award.seasonYear).filter(Boolean)).size;
  const featureTotal = unlockedFeatures.length + lockedFeatures.length;

  const exhibits = useMemo<Exhibit[]>(() => {
    const titleYears = achievements
      .filter((achievement) => achievement.code === 'LEAGUE_CHAMPION')
      .map((achievement) => achievement.earnedAt)
      .filter(Boolean)
      .join(', ');
    const featureExhibits = unlockedFeatures.slice(0, 5).map((feature, index) => ({
      id: feature.code ?? `feature-${index}`,
      label: feature.display_name ?? 'Stadium Feature',
      zone: feature.zone ?? 'Legacy Zone',
      summary: `Unlocked ${dateLabel(feature.unlockedAt)}.`,
      detail: `This feature is visible because ${franchise.name} earned ${feature.achievement_code?.replaceAll('_', ' ') ?? 'a franchise milestone'}.`,
      stat: 'Unlocked',
      className: `legacyHotspot featureHotspot featureHotspot${index + 1}`
    }));

    return [
      {
        id: 'championship-banners',
        label: 'Championship Banner Rafters',
        zone: 'Rafters',
        summary: `${titleCount} title${titleCount === 1 ? '' : 's'} displayed above the stadium.`,
        detail: titleYears ? `Championship seasons: ${titleYears}.` : 'No league title has been stored for this franchise yet.',
        stat: `${titleCount} Titles`,
        className: 'legacyHotspot bannerHotspot'
      },
      {
        id: 'legacy-statue',
        label: `${franchise.abbreviation} Legacy Statue`,
        zone: 'Plaza',
        summary: titleCount > 0 ? 'The statue honors the title era.' : 'The statue marks the founding era.',
        detail: titleCount > 0 ? `${franchise.name} has a championship monument fans can inspect up close.` : `${franchise.name} has a founder statue until a championship gives the plaza a new subject.`,
        stat: franchise.establishedYear ? `Est. ${franchise.establishedYear}` : 'Founder',
        className: 'legacyHotspot statueHotspot'
      },
      {
        id: 'rivalry-monument',
        label: 'Rivalry Monument',
        zone: 'Exterior',
        summary: `${rivalryCount} rivalry win${rivalryCount === 1 ? '' : 's'} carved into the outer walk.`,
        detail: rivalryCount > 0 ? 'Rivalry wins permanently light the exterior walk and monument wall.' : 'The rivalry wall is ready for the first stored rivalry win.',
        stat: `${rivalryCount} Wins`,
        className: 'legacyHotspot rivalryHotspot'
      },
      {
        id: 'front-office',
        label: 'Owner’s Office',
        zone: 'Interior',
        summary: 'A trophy desk for franchise accomplishments.',
        detail: 'The office keeps the franchise view focused on current identity, earned features, and permanent accomplishments.',
        stat: `${unlockedFeatures.length}/${featureTotal || 0} Features`,
        className: 'legacyHotspot officeHotspot'
      },
      ...featureExhibits
    ];
  }, [achievements, featureTotal, franchise, rivalryCount, titleCount, unlockedFeatures]);

  const [selectedId, setSelectedId] = useState(exhibits[0]?.id ?? 'legacy-statue');
  const selected = exhibits.find((exhibit) => exhibit.id === selectedId) ?? exhibits[0];

  return <section className="stadiumLegacyExperience" style={{ '--team-primary': franchise.primary, '--team-secondary': franchise.secondary } as React.CSSProperties}>
    <div className="legacyModeTabs" role="tablist" aria-label="Stadium legacy views">
      <button type="button" role="tab" aria-selected={view === 'stadium'} className={view === 'stadium' ? 'active' : ''} onClick={() => setView('stadium')}>Stadium</button>
      <button type="button" role="tab" aria-selected={view === 'office'} className={view === 'office' ? 'active' : ''} onClick={() => setView('office')}>Owner’s Office</button>
      <button type="button" role="tab" aria-selected={view === 'hall'} className={view === 'hall' ? 'active' : ''} onClick={() => setView('hall')}>Hall of Fame</button>
    </div>

    {view === 'stadium' && <div className="legacyView legacyStadiumView">
      <div className="legacyStadiumHeader">
        <div>
          <p className="eyebrow">STADIUM VIEW</p>
          <h2>{stadiumName}</h2>
        </div>
        <div className="legacyScoreStrip" aria-label={`${franchise.name} has ${titleCount} titles, ${rivalryCount} rivalry wins, and ${unlockedFeatures.length} unlocked stadium features`}>
          <span>{titleCount} Titles</span>
          <span>{rivalryCount} Rivalries</span>
          <span>{unlockedFeatures.length} Features</span>
        </div>
      </div>

      <div className="legacyStadiumGrid">
        <div className="legacyScene" aria-label={`${franchise.name} stadium with selectable banners, statue, office, and monuments`}>
          <Image className="legacySceneImage" src="/environments/big-exec-starter-stadium-v1.jpg" alt={`${franchise.name} stadium exterior at night`} fill priority sizes="(max-width: 760px) 100vw, 860px" />
          <div className="legacyAtmosphere" aria-hidden="true" />
          <div className="legacyScoreboard" aria-hidden="true">
            <span>HOME OF</span>
            <FranchiseCrest className="legacyScoreboardCrest" name={franchise.name} abbreviation={franchise.abbreviation} primary={franchise.primary} secondary={franchise.secondary} />
            <strong>{franchise.abbreviation}</strong>
          </div>
          <div className="legacyRafterLine" aria-hidden="true">
            {Array.from({ length: Math.max(1, Math.min(titleCount, 5)) }).map((_, index) => <i key={index}>TITLE {index + 1}</i>)}
          </div>
          {exhibits.map((exhibit) => <button
            key={exhibit.id}
            type="button"
            className={`${exhibit.className} ${selected?.id === exhibit.id ? 'selected' : ''}`}
            aria-pressed={selected?.id === exhibit.id}
            aria-label={`Inspect ${exhibit.label}: ${exhibit.summary}`}
            onClick={() => setSelectedId(exhibit.id)}
          >
            <span>{exhibit.label}</span>
          </button>)}
        </div>

        <aside className="legacyZoomPanel" aria-live="polite">
          <p className="eyebrow">ZOOMED DETAIL</p>
          <div className="legacyStatueZoom" aria-hidden="true">
            <span>{selected?.stat}</span>
            <b>{selected?.label}</b>
          </div>
          <h3>{selected?.label}</h3>
          <p>{selected?.summary}</p>
          <p>{selected?.detail}</p>
          <div className="legacyObjectRail" aria-label="Inspectable stadium objects">
            {exhibits.map((exhibit) => <button key={exhibit.id} type="button" className={selected?.id === exhibit.id ? 'active' : ''} onClick={() => setSelectedId(exhibit.id)}>{exhibit.zone}</button>)}
          </div>
        </aside>
      </div>
    </div>}

    {view === 'office' && <div className="legacyView legacyOfficeView">
      <div className="officeScene">
        <Image src="/environments/big-exec-front-office-v1.jpg" alt={`${franchise.name} front office trophy room`} fill sizes="(max-width: 760px) 100vw, 1040px" />
        <div className="officeSceneWash" aria-hidden="true" />
        <div className="officeDesk">
          <FranchiseCrest className="officeCrest" name={franchise.name} abbreviation={franchise.abbreviation} primary={franchise.primary} secondary={franchise.secondary} />
          <strong>{franchise.name}</strong>
          <span>{unlockedFeatures.length} unlocked stadium features</span>
        </div>
      </div>
      <div className="legacyLedger">
        <p className="eyebrow">OWNER’S OFFICE</p>
        <h2>Franchise awards desk.</h2>
        <div className="legacyAwardGrid">
          {achievements.slice(0, 8).map((achievement) => <article className="legacyAwardCard" key={achievement.id}>
            <span>{achievement.week ? `Week ${achievement.week}` : achievement.earnedAt ?? 'Stored'}</span>
            <strong>{achievement.displayName}</strong>
            <p>{achievement.description}</p>
          </article>)}
          {!achievements.length && <p className="successNotice">No franchise achievements are stored yet.</p>}
        </div>
      </div>
    </div>}

    {view === 'hall' && <div className="legacyView legacyHallView">
      <div className="legacyHallHeader">
        <div>
          <p className="eyebrow">HALL OF FAME</p>
          <h2>League trophy history.</h2>
        </div>
        <span className="sectionCounter">{trophySeasonCount}/5 seasons</span>
      </div>
      <div className="hallTrophyWalk" aria-label="League championship awards">
        {trophies.map((award) => <article className="hallTrophy" key={award.id}>
          <span>{award.seasonYear ?? 'Season'} • {award.bracket.toUpperCase()}</span>
          <strong>{award.awardName}</strong>
          <b>{award.winnerAbbreviation ?? award.winnerName}</b>
          <p>{award.winnerName}{award.runnerUpName ? ` defeated ${award.runnerUpName}` : ''}</p>
          {award.awardedAt && <small>{award.awardedAt}</small>}
        </article>)}
        {!trophies.length && <p className="successNotice">No completed league trophies are stored for the last five seasons yet.</p>}
      </div>
      <div className="legacyAwardList" aria-label="Recent league awards">
        {leagueAwards.filter((award) => award.kind === 'weekly').slice(0, 12).map((award) => <article key={award.id}>
          <span>{award.seasonYear ?? 'Season'} • {award.bracket}</span>
          <strong>{award.awardName}</strong>
          <p>{award.winnerName}</p>
        </article>)}
      </div>
    </div>}

    <section className="legacyAccessibilitySummary" aria-labelledby="stadium-summary-heading">
      <h2 id="stadium-summary-heading">Stadium summary for assistive technology.</h2>
      <p>{franchise.name} has {titleCount} title{titleCount === 1 ? '' : 's'}, {rivalryCount} rivalry win{rivalryCount === 1 ? '' : 's'}, and {unlockedFeatures.length} unlocked stadium feature{unlockedFeatures.length === 1 ? '' : 's'}.</p>
      <div className="legacySummaryColumns">
        <div>
          <strong>Unlocked features</strong>
          <ul>{unlockedFeatures.map((feature) => <li key={feature.code ?? feature.display_name}>{feature.display_name ?? 'Stadium feature'} in {feature.zone ?? 'the stadium'}.</li>)}</ul>
        </div>
        <div>
          <strong>League trophies</strong>
          <ul>{trophies.slice(0, 5).map((award) => <li key={award.id}>{award.seasonYear ?? 'Season'} {award.awardName}: {award.winnerName}.</li>)}</ul>
        </div>
      </div>
      {nextUnlock && <p>Next unlock: {nextUnlock}.</p>}
    </section>
  </section>;
}
