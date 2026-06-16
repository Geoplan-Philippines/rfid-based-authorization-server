import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

// Pagination only for now. Result / date / tag-status filters deferred until needed.
export class GetAllTransactionsQueryDTO extends PaginationQueryDTO {}
