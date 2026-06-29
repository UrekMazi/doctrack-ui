import React from 'react'
import { Link } from 'react-router-dom'

export default function RecordsKanban({ lanes }) {
  return (
    <div className="records-kanban-shell">
      <div className="records-kanban-track">
        {lanes.map((lane) => {
          const visibleItems = (lane.items || []).slice(0, lane.visibleCount || 4)

          return (
            <section className="records-kanban-lane" key={lane.id || lane.key || lane.title} style={{ '--lane-accent': lane.accent || '#0d6efd' }}>
              <header className="records-kanban-lane-header">
                <div className="records-kanban-lane-titlewrap">
                  <div className="records-kanban-lane-kicker">Status:</div>
                  <div className="records-kanban-lane-title">{lane.title}</div>
                  <div className="records-kanban-lane-subtitle">{lane.subtitle}</div>
                </div>
              </header>

              <div className="records-kanban-lane-body">
                {visibleItems.length === 0 ? (
                  <div className="records-kanban-empty">{lane.emptyText || 'No documents'}</div>
                ) : (
                  visibleItems.map((doc) => (
                    <Link key={doc.id} to={`/document/${doc.id}`} className="records-kanban-item text-decoration-none" title={doc.subject}>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="tracking-number" style={{ fontSize: '0.85rem' }}>{doc.trackingNumber}</span>
                        {(doc.targetDivision === 'Officer-in-Charge (OIC)' || doc.targetDivision === 'OIC') && (
                          <span className="badge bg-info text-dark ms-1" style={{ fontSize: '0.6rem' }} title="Assigned to Officer-in-Charge">OIC</span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
