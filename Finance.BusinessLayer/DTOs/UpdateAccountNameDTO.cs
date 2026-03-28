namespace Finance.BusinessLayer.DTOs
{
    public class UpdateAccountNameDTO
    {
        public string? Name { get; set; }

        public string? AccountNumber { get; set; }

        public string? Description { get; set; }

        public decimal? OpeningBalance { get; set; }
    }
}
