# SUMIT API coverage

The official documentation (https://app.sumit.co.il/developers/api/ and the Swagger UI at
https://app.sumit.co.il/help/developers/swagger/) is only reachable from a logged-in SUMIT
account, so the request shapes below were reconstructed from public client libraries:

| Source | What it gave us |
| --- | --- |
| `n8n-nodes-sumit` (npm, achiya-automation) | 48 endpoint paths + request bodies + trigger subscribe/unsubscribe |
| `sumit-api` / `sumit-react` (npm, Digitizers) + their `docs/API_REFERENCE.md` | charge / recurring / documents.create shapes, enums (document types 0–22, currencies, search modes), response envelope, PDF binary behaviour |
| `officeguy/laravel-sumit-gateway` (Packagist, 1:1 port of the official WooCommerce plugin) | charge/beginredirect/recurring/creditguy/paymentmethods/documents.list/getdebt/CRM bodies |
| `officeguy-apis-accounting` (npm, official OfficeGuy Swagger 1.1.6) | original enum names (DocumentType, CustomerSearchMode, Currency, Language), payment detail objects |

**Confidence levels** (shown in each tool description and in the admin console):

* **high** – shape appears identically in ≥2 independent sources or in the official OfficeGuy swagger.
* **medium** – one solid source (usually the WooCommerce-port).
* **low** – inferred / partially documented. If SUMIT rejects the request, pass the exact fields from the official docs through the `extra` parameter, or use `sumit_api_request`.

To get *exact* coverage, download the official Swagger JSON (you need to be logged in) and run
`npm run import-swagger -- swagger.json` – every operation in the file becomes a tool.

## Curated tools

| Tool | Path | Scope | Confidence |
| --- | --- | --- | --- |
| sumit_customers_create | /accounting/customers/create/ | write | high |
| sumit_customers_update | /accounting/customers/update/ | write | high |
| sumit_customers_get_details_url | /accounting/customers/getdetailsurl/ | read | high |
| sumit_customers_create_remark | /accounting/customers/createremark/ | write | medium |
| sumit_documents_create | /accounting/documents/create/ | write | high |
| sumit_documents_list | /accounting/documents/list/ | read | medium |
| sumit_documents_get_details | /accounting/documents/getdetails/ | read | high |
| sumit_documents_get_pdf | /accounting/documents/getpdf/ | read | high |
| sumit_documents_send | /accounting/documents/send/ | write | high |
| sumit_documents_cancel | /accounting/documents/cancel/ | write (destructive) | high |
| sumit_documents_move_to_books | /accounting/documents/movetobooks/ | write | medium |
| sumit_documents_add_expense | /accounting/documents/addexpense/ | write | low |
| sumit_documents_get_debt | /accounting/documents/getdebt/ | read | medium |
| sumit_documents_get_debt_report | /accounting/documents/getdebtreport/ | read | medium |
| sumit_general_get_vat_rate | /accounting/general/getvatrate/ | read | high |
| sumit_general_get_exchange_rate | /accounting/general/getexchangerate/ | read | high |
| sumit_general_verify_bank_account | /accounting/general/verifybankaccount/ | read | high |
| sumit_general_get_next_document_number | /accounting/general/getnextdocumentnumber/ | read | medium |
| sumit_general_set_next_document_number | /accounting/general/setnextdocumentnumber/ | write | low |
| sumit_general_update_settings | /accounting/general/updatesettings/ | write | low |
| sumit_income_items_create | /accounting/incomeitems/create/ | write | high |
| sumit_income_items_list | /accounting/incomeitems/list/ | read | high |
| sumit_stock_list | /stock/stock/list/ | read | high |
| sumit_payments_charge | /billing/payments/charge/ | payments | high |
| sumit_payments_refund | /billing/payments/charge/ (negative amount + SupportCredit) | payments | medium |
| sumit_payments_get | /billing/payments/get/ | read | high |
| sumit_payments_list | /billing/payments/list/ | read | high |
| sumit_payments_begin_redirect | /billing/payments/beginredirect/ | write | high |
| sumit_payments_multivendor_charge | /billing/payments/multivendorcharge/ | payments | low |
| sumit_payment_methods_get_for_customer | /billing/paymentmethods/getforcustomer/ | read | high |
| sumit_payment_methods_set_for_customer | /billing/paymentmethods/setforcustomer/ | write | high |
| sumit_payment_methods_remove | /billing/paymentmethods/remove/ | write (destructive) | high |
| sumit_recurring_charge | /billing/recurring/charge/ | payments | high |
| sumit_recurring_list_for_customer | /billing/recurring/listforcustomer/ | read | high |
| sumit_recurring_update | /billing/recurring/update/ | write | low |
| sumit_recurring_cancel | /billing/recurring/cancel/ | write (destructive) | medium |
| sumit_creditguy_transaction | /creditguy/gateway/transaction/ | payments | medium |
| sumit_creditguy_capture | /creditguy/gateway/capture/ | payments | medium |
| sumit_creditguy_tokenize_single_use | /creditguy/vault/tokenizesingleusejson/ (APIPublicKey) | write | medium |
| sumit_crm_list_folders | /crm/schema/listfolders/ | read | high |
| sumit_crm_get_folder | /crm/schema/getfolder/ | read | high |
| sumit_crm_list_views | /crm/views/listviews/ | read | high |
| sumit_crm_list_entities | /crm/data/listentities/ | read | medium |
| sumit_crm_get_entity | /crm/data/getentity/ | read | high |
| sumit_crm_create_entity | /crm/data/createentity/ | write | medium |
| sumit_crm_update_entity | /crm/data/updateentity/ | write | high (verified live) |
| sumit_documents_set_closed | /crm/data/getentity/ + /crm/data/updateentity/ (Accounting_Closed) | write | high (verified live) |
| sumit_crm_archive_entity | /crm/data/archiveentity/ | write (destructive) | high |
| sumit_crm_delete_entity | /crm/data/deleteentity/ | write (destructive) | high |
| sumit_crm_count_entity_usage | /crm/data/countentityusage/ | read | medium |
| sumit_crm_get_entity_print_html | /crm/data/getentityprinthtml/ | read | medium |
| sumit_crm_get_entities_html | /crm/data/getentitieshtml/ | read | low |
| sumit_triggers_subscribe | /billing/triggers/triggers/subscribe/ | write | low |
| sumit_triggers_unsubscribe | /billing/triggers/triggers/unsubscribe/ | write | low |
| sumit_company_get_details | /website/companies/getdetails/ | read | high |
| sumit_company_list_quotas | /website/companies/listquotas/ | read | medium |
| sumit_company_update | /website/companies/update/ | write | medium |
| sumit_company_create | /website/companies/create/ | write | medium |
| sumit_users_create | /website/users/create/ | write | medium |
| sumit_users_login_redirect | /website/users/loginredirect/ | write | medium |
| sumit_permissions_set | /website/permissions/set/ | write | medium |
| sumit_permissions_remove | /website/permissions/remove/ | write (destructive) | medium |
| sumit_tickets_create | /customerservice/tickets/create/ | write | medium |

## Closing quotes / orders

SUMIT has no dedicated "close document" endpoint (`/accounting/documents/close/`, `setclosed`, `updatestatus`,
`markasclosed` all fall through to the help-center HTML page). Open documents are CRM entities whose folder
schema (`/crm/schema/getfolder/`) exposes a boolean property `Accounting_Closed` ("סגורה"), the same flag SUMIT
sets automatically when an invoice is produced from the quote. `sumit_documents_set_closed` reads the entity,
updates it with `{ "Entity": { "ID", "Folder", "Properties": { "Accounting_Closed": true } } }` and re-reads it.
Property values must be plain values inside `Entity.Properties` — arrays (the shape `getentity` returns) are
rejected with "Value Type not supported".

## Meta tools (always available)

| Tool | Purpose |
| --- | --- |
| sumit_list_accounts | Accounts this connection may use + which one is the default |
| sumit_use_account | Set the default account for the current session |
| sumit_test_connection | Verify credentials (`/website/companies/getdetails/`) |
| sumit_api_catalog | Search the catalog of known endpoints |
| sumit_api_request | Call **any** SUMIT endpoint with a raw JSON body (Credentials injected, scope inferred from the path) |

## Known SUMIT capabilities without a curated tool yet

SMS sending / mailing lists, letters ("מכתב בקליק"), Hashavshevet export, HR/payroll and the
full "General billing" module are exposed by SUMIT but their paths are not in any public client
we could inspect. They are reachable today through `sumit_api_request` (with the path from the
official docs) and become first-class tools once you import the Swagger file.

## Conventions confirmed across sources

* Every call is `POST https://api.sumit.co.il/<module>/<controller>/<action>/` with JSON.
* Body always carries `Credentials: { CompanyID, APIKey }` (never a Bearer header).
* Response envelope: `{ Status, UserErrorMessage, TechnicalErrorDetails, Data }`; `Status` is
  `"Success"`, `"Success (0)"` or `0` on success.
* `getpdf` may answer with the raw PDF binary – the server returns it as a base64 resource.
* Document types (`Accounting_Typed_DocumentType`): 0 Invoice, 1 InvoiceAndReceipt, 2 Receipt,
  3 ProformaInvoice, 4 DonationReceipt, 5 CreditInvoice, 6 CreditInvoiceAndReceipt, 7 CreditReceipt,
  8 Order, 9 DeliveryNote, 10 GoodsReturnNote, 11 PurchasingOrder, 12 PriceQuotation,
  13 PaymentRequest, 14 CreditDonationReceipt, 15–22 expense variants and SupplierPayment.
* Customer `SearchMode`: 0 Automatic, 1 None, 2 ExternalIdentifier, 3 Name, 4 CompanyNumber, 5 Phone, 6 EmailAddress.
* Currency: ILS 0, USD 1, EUR 2 (string codes are accepted too). Language: 0 he, 1 en, 2 ar, 3 es.
