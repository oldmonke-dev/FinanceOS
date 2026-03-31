namespace Finance.BusinessLayer.DTOs
{
    public class UpdateAccountResultDTO
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public int UpdatedNodeCount { get; set; }

        public bool AccountTypeChanged { get; set; }
    }
}
