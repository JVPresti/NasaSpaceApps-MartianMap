import { t } from '../i18n/index.js';
const GROUPS = [
  {
    title: 'ui.walk',
    rows: [
      ['menu.w.a.s.d.or.arrows', 'ui.walk'],
      ['menu.shift', 'menu.jog'],
      ['menu.mouse', 'menu.look.around.while.the.pointer.is.captured'],
      ['ui.esc', 'menu.release.the.mouse.and.pause'],
      ['menu.h', 'menu.open.this.help.and.pause'],
      ['menu.q.hold.2.s', 'menu.point.at.the.ground.to.mark.a.find'],
      ['menu.y.n', 'menu.add.the.find.to.the.route.or.dismiss.it'],
    ],
  },
  {
    title: 'ui.plan',
    rows: [
      ['menu.right.drag', 'menu.pan.the.map'],
      ['menu.scroll', 'menu.zoom.in.and.out'],
      ['ui.esc', 'menu.pause.and.open.the.menu'],
    ],
  },
];

/** The shared controls reference, shown on the start screen and from the pause menu. */
export default function ControlsHelp() {
  return (
    <div className="controls-help">
      {GROUPS.map((group) => (
        <section key={t(group.title)} className="controls-group">
          <h3>{t(group.title)}</h3>
          <dl className="controls-list">
            {group.rows.map(([keys, action]) => (
              <div className="controls-row" key={t(keys)}>
                <dt>{t(keys)}</dt>
                <dd>{t(action)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
