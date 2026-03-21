using Finance.Domain.Entities.UserSession;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Repositories
{
    public class ImportSessionRepository : IImportSessionRepository
    {
        private readonly AppDbContext _context;

        public ImportSessionRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<ImportSession> CreateAsync(ImportSession session, CancellationToken cancellationToken = default)
        {
            _context.ImportSessions.Add(session);
            await _context.SaveChangesAsync(cancellationToken);
            return session;
        }

        public async Task<List<ImportSession>> GetByUserIdAsync(Guid userId, CancellationToken cancellationToken = default)
        {
            return await _context.ImportSessions
                .Include(session => session.User)
                .Include(session => session.SourceAccount)
                .Include(session => session.Rows)
                    .ThenInclude(row => row.DestinationAccount)
                .Where(session => session.UserId == userId)
                .OrderByDescending(session => session.CreatedAt)
                .ToListAsync(cancellationToken);
        }

        public async Task<ImportSession?> GetByIdAsync(Guid sessionId, Guid userId, CancellationToken cancellationToken = default)
        {
            return await _context.ImportSessions
                .Include(session => session.User)
                .Include(session => session.SourceAccount)
                .Include(session => session.Rows)
                    .ThenInclude(row => row.DestinationAccount)
                .FirstOrDefaultAsync(
                    session => session.Id == sessionId && session.UserId == userId,
                    cancellationToken);
        }

        public async Task<bool> DeleteAsync(Guid sessionId, Guid userId, CancellationToken cancellationToken = default)
        {
            var session = await _context.ImportSessions
                .FirstOrDefaultAsync(
                    item => item.Id == sessionId && item.UserId == userId,
                    cancellationToken);

            if (session is null)
            {
                return false;
            }

            _context.ImportSessions.Remove(session);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> UpdateSourceAccountAsync(
            Guid sessionId,
            Guid userId,
            Guid? sourceAccountId,
            CancellationToken cancellationToken = default)
        {
            var session = await _context.ImportSessions
                .FirstOrDefaultAsync(
                    item => item.Id == sessionId && item.UserId == userId,
                    cancellationToken);

            if (session is null)
            {
                return false;
            }

            session.SourceAccountId = sourceAccountId;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> UpdateTitleAsync(
            Guid sessionId,
            Guid userId,
            string? fileName,
            CancellationToken cancellationToken = default)
        {
            var session = await _context.ImportSessions
                .FirstOrDefaultAsync(
                    item => item.Id == sessionId && item.UserId == userId,
                    cancellationToken);

            if (session is null)
            {
                return false;
            }

            session.FileName = fileName;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> UpdateRowDestinationAccountAsync(
            Guid sessionId,
            Guid rowId,
            Guid userId,
            Guid? destinationAccountId,
            CancellationToken cancellationToken = default)
        {
            var row = await _context.ImportSessionRows
                .Include(item => item.ImportSession)
                .FirstOrDefaultAsync(
                    item => item.Id == rowId
                        && item.ImportSessionId == sessionId
                        && item.ImportSession.UserId == userId,
                    cancellationToken);

            if (row is null)
            {
                return false;
            }

            row.DestinationAccountId = destinationAccountId;
            row.DestinationAccountError = null;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> UpdateRowLedgerInclusionAsync(
            Guid sessionId,
            Guid rowId,
            Guid userId,
            bool includeInLedger,
            CancellationToken cancellationToken = default)
        {
            var row = await _context.ImportSessionRows
                .Include(item => item.ImportSession)
                .FirstOrDefaultAsync(
                    item => item.Id == rowId
                        && item.ImportSessionId == sessionId
                        && item.ImportSession.UserId == userId,
                    cancellationToken);

            if (row is null)
            {
                return false;
            }

            row.IncludeInLedger = includeInLedger;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<int> DeleteRowsAsync(
            Guid sessionId,
            Guid userId,
            IEnumerable<Guid> rowIds,
            CancellationToken cancellationToken = default)
        {
            var rowIdSet = rowIds
                .Where(rowId => rowId != Guid.Empty)
                .Distinct()
                .ToHashSet();

            if (rowIdSet.Count == 0)
            {
                return 0;
            }

            var rows = await _context.ImportSessionRows
                .Include(item => item.ImportSession)
                .Where(
                    item => rowIdSet.Contains(item.Id)
                        && item.ImportSessionId == sessionId
                        && item.ImportSession.UserId == userId)
                .ToListAsync(cancellationToken);

            if (rows.Count == 0)
            {
                return 0;
            }

            _context.ImportSessionRows.RemoveRange(rows);
            await _context.SaveChangesAsync(cancellationToken);
            return rows.Count;
        }

        public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
