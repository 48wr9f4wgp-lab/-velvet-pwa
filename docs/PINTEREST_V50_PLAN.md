# Pinterest v50 plan

Status: DEFERRED / NOT IMPLEMENTED

The public Pinterest Board/Profile widget integration was retired in v49.2 because the intended Velvet use case should not require making private Pinterest boards public.

Future Pinterest work must start from a fresh verification of Pinterest's current official developer documentation and policies. The desired user experience is:

- keep Pinterest boards private;
- authorize Pinterest once rather than paste board URLs repeatedly;
- show multiple authorized boards in Velvet with quick switching;
- do not weaken board privacy to satisfy the integration;
- keep credentials/tokens out of the repository;
- do not treat this plan as evidence that current Pinterest APIs support every desired behavior.

No Pinterest runtime, credential, token, board URL, or public widget is active in Velvet after v49.2.
