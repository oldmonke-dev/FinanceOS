namespace Finance.BusinessLayer.DTOs.ImportSessions
{
    public class DeleteImportSessionRowsDTO
    {
        public List<Guid> RowIds { get; set; } = new();
    }
}
