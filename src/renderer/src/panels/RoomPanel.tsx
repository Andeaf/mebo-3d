import { useState, type ReactElement } from 'react'
import { ROOM_LIMITS, type RoomDesign } from '@core/room'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'
import { DimensionField } from './DimensionField'

/**
 * Room size, collapsed by default: it is set once per project and then mostly
 * left alone, so it should not crowd the cabinet parameters. Shrinking the
 * room re-places the cabinets inside it (and is refused outright if one of
 * them has nowhere left to go).
 */
export function RoomPanel(): ReactElement {
  const t = useT()
  const room = useAppStore((state) => state.scene.room)
  const updateRoom = useAppStore((state) => state.updateRoom)
  const [open, setOpen] = useState(false)

  const patch = (next: Partial<RoomDesign>): void => updateRoom({ ...room, ...next })

  return (
    <section className="panel">
      <button
        type="button"
        className="panel__collapse"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="panel__title panel__title--inline">{t('room.title')}</span>
        <span className="panel__collapse-mark" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <>
          <DimensionField
            labelKey="room.width"
            value={room.widthMm}
            min={ROOM_LIMITS.widthMm.min}
            max={ROOM_LIMITS.widthMm.max}
            onChange={(widthMm) => patch({ widthMm })}
          />
          <DimensionField
            labelKey="room.length"
            value={room.lengthMm}
            min={ROOM_LIMITS.lengthMm.min}
            max={ROOM_LIMITS.lengthMm.max}
            onChange={(lengthMm) => patch({ lengthMm })}
          />
          <DimensionField
            labelKey="room.wallHeight"
            value={room.wallHeightMm}
            min={ROOM_LIMITS.wallHeightMm.min}
            max={ROOM_LIMITS.wallHeightMm.max}
            onChange={(wallHeightMm) => patch({ wallHeightMm })}
          />
        </>
      )}
    </section>
  )
}
