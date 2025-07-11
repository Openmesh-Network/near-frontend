"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounce } from "@uidotdev/usehooks";
import { Loader, MapPin, Search, Server, X } from "lucide-react";

import { getSummary, type HardwareProduct, type Specs } from "@/lib/hardware";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ComboBox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";

const STEP_MIN = 1;
const STEP_MAX = 1000;
const PRICE_MAX = 100000;

type HardwareSelectorProps = {
  specs?: Specs;
  onSelect: (selectedProvider: HardwareProduct) => void;
};
export default function HardwareSelector({
  specs,
  onSelect,
}: HardwareSelectorProps) {
  const [searchInput, setSearchInput] = useState<string>("");
  const debouncedSearchInput = useDebounce(searchInput, 500);
  const [region, setRegion] = useState<string | undefined>();
  const [priceRange, setPriceRange] = useState<
    [number | undefined, number | undefined]
  >([1, PRICE_MAX]);
  const debouncedPriceRange = useDebounce(priceRange, 500);
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(true);
  const [onlyDedicated, setOnlyDedicated] = useState<boolean>(false);

  const { data: hivelocityData, isFetching: hivelocityFetching } = useQuery({
    queryKey: ["inventory", "Hivelocity"],
    queryFn: async () => {
      return fetch("/api/hivelocity/inventory")
        .then((res) => res.json())
        .then((res) => res as HardwareProduct[]);
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000, // 1 min
  });
  const { data: vultrData, isFetching: vultrFetching } = useQuery({
    queryKey: ["inventory", "Vultr"],
    queryFn: async () => {
      return fetch("/api/vultr/inventory")
        .then((res) => res.json())
        .then((res) => res as HardwareProduct[]);
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000, // 1 min
  });

  const rawProviderData = useMemo(
    () => (hivelocityData ?? []).concat(vultrData ?? []),
    [hivelocityData, vultrData]
  );
  const providersLoading = useMemo(
    () => [
      { name: "Hivelocity", loaded: !hivelocityFetching },
      { name: "Vultr", loaded: !vultrFetching },
    ],
    [hivelocityFetching, vultrFetching]
  );
  const providersFetching = useMemo(
    () => providersLoading.some((provider) => !provider.loaded),
    [providersLoading]
  );
  const filteredProviderData = useMemo(() => {
    return rawProviderData
      .filter((product) => {
        if (!product.price.monthly) {
          // No price or free is probably not meant to be shown
          return false;
        }

        if (
          debouncedSearchInput &&
          !product.productName
            .toLowerCase()
            .includes(debouncedSearchInput.toLowerCase()) &&
          !product.providerName
            .toLowerCase()
            .includes(debouncedSearchInput.toLowerCase())
        ) {
          return false;
        }

        if (region && region.toLowerCase() !== product.location.toLowerCase()) {
          return false;
        }

        if (specs?.ram && product.ram.capacity < specs.ram / 1024) {
          return false;
        }

        if (
          specs?.storage &&
          product.storage.reduce((prev, cur) => prev + cur.capacity, 0) <
            specs.storage / 1024
        ) {
          return false;
        }

        if (
          debouncedPriceRange[0] !== undefined &&
          product.price.monthly < debouncedPriceRange[0]
        ) {
          return false;
        }

        if (
          debouncedPriceRange[1] !== undefined &&
          product.price.monthly > debouncedPriceRange[1]
        ) {
          return false;
        }

        if (onlyAvailable && product.available === 0) {
          return false;
        }

        if (onlyDedicated && product.type === "VPS") {
          return false;
        }

        return true;
      })
      .sort((p1, p2) => {
        if (p1.price.monthly === undefined && p2.price.monthly === undefined) {
          return 0;
        }

        if (p1.price.monthly === undefined) {
          return 1;
        }

        if (p2.price.monthly === undefined) {
          return -1;
        }

        return p1.price.monthly - p2.price.monthly;
      })
      .map((product) => {
        return { ...product, summary: getSummary({ hardware: product }) };
      });
  }, [
    rawProviderData,
    debouncedSearchInput,
    region,
    specs,
    debouncedPriceRange,
    onlyAvailable,
    onlyDedicated,
  ]);

  const regionData = useMemo(() => {
    const regionMap = new Map<string, number>();
    rawProviderData.forEach((product) =>
      regionMap.set(
        product.location,
        (regionMap.get(product.location) ?? 0) + 1
      )
    );
    const regionArray = [...regionMap].map(([name, count]) => {
      return { name, count };
    });
    regionArray.sort((r1, r2) => r2.count - r1.count);
    return regionArray.map((r) => r.name);
  }, [rawProviderData]);

  const histogramPriceData = useMemo(() => {
    if (!rawProviderData?.length) return [];
    const BINS = 32;
    const prices = rawProviderData
      .map((provider) => provider.price.monthly)
      .filter((price) => price !== undefined);

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;

    const binSize = range / BINS;
    const bins = Array.from({ length: BINS }, (_, i) => minPrice + i * binSize);

    const counts = new Array(BINS).fill(0);
    prices.forEach((price) => {
      const binIndex = Math.min(
        Math.floor((price - minPrice) / binSize),
        BINS - 1
      );
      counts[binIndex]++;
    });

    const totalCount = prices.length;
    const histogram = counts.map((count, index) => [
      bins[index],
      (count / totalCount) * 100,
    ]);
    return histogram;
  }, [rawProviderData]);

  const scaledHistogramData = useMemo(() => {
    const MIN = 10;
    const MAX = 100;
    const percentages = histogramPriceData.map(([_, percentage]) => percentage);

    const minPercentage = Math.min(...percentages);
    const maxPercentage = Math.max(...percentages);

    return percentages.map((p) => {
      const normalized = (p - minPercentage) / (maxPercentage - minPercentage);
      return MIN + normalized * (MAX - MIN);
    });
  }, [histogramPriceData]);

  const [shownResults, setShownResults] = useState<number>(10);
  useEffect(() => {
    if (shownResults > filteredProviderData.length) {
      return;
    }
    // Reduce the initial load time (CPU bottleneck from all product cards)
    const timer = setTimeout(() => setShownResults(shownResults + 100), 100);
    return () => clearTimeout(timer);
  }, [shownResults, setShownResults, filteredProviderData.length]);

  const products = useMemo(() => {
    // Cache this (as its significantly large / slow to generate)
    if (!filteredProviderData) {
      return [];
    }

    return Object.entries(
      filteredProviderData
        .slice(0, Math.min(shownResults, filteredProviderData.length))
        .reduce(
          (prev, cur) => {
            const id = `${cur.providerName}_${cur.id.split("_")[0]}_${
              cur.available
            }_${cur.price.monthly}_${cur.summary}`; // Products with the same id are assumed to be the same
            if (!Object.hasOwn(prev, id)) {
              prev[id] = {};
            }

            prev[id][cur.location] = cur;
            return prev;
          },
          {} as {
            [id: string]: {
              [location: string]: (typeof filteredProviderData)[0];
            };
          }
        )
    ).map(([id, product], i) => {
      return <ProductCard key={id} product={product} onSelect={onSelect} />;
    });
  }, [filteredProviderData, shownResults]);

  return (
    <div>
      <div>
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-lg bg-primary/10 transition-all",
            providersFetching ? "h-3" : "h-0"
          )}
        >
          <div
            className="absolute left-0 top-0 h-full animate-pulse rounded-full bg-primary transition-all"
            style={{
              width: `${
                (100 / providersLoading.length) *
                providersLoading.reduce(
                  (prev, cur) => prev + (cur.loaded ? 1 : 0),
                  0
                )
              }%`,
            }}
          />
        </div>
        <div
          className={cn(
            "my-1 flex items-center gap-1 overflow-hidden transition-all",
            providersFetching ? "h-auto" : "h-0"
          )}
        >
          <Loader className="size-3.5 animate-spin" />
          <span className="text-sm font-medium text-muted-foreground">
            Searching{" "}
            {providersLoading.find((provider) => !provider.loaded)?.name}...
          </span>
        </div>
        <div className="flex gap-12">
          <div className="flex flex-col gap-3 max-md:hidden">
            <Button
              type="button"
              disabled={
                region === undefined &&
                searchInput === "" &&
                priceRange[0] === undefined &&
                priceRange[1] === undefined
              }
              size="lg"
              variant="outline"
              onClick={() => {
                setPriceRange([1, PRICE_MAX]);
                setRegion(undefined);
                setSearchInput("");
              }}
              className="gap-1.5"
            >
              <X className="size-4 shrink-0" />
              Reset filter
            </Button>
            <Separator className="my-3" />
            <div className="flex flex-col space-y-2">
              <Label htmlFor="search">Search by provider or product name</Label>
              <div className="relative flex w-full max-w-80 items-center">
                <Search className="absolute left-3 size-4" />
                <Input
                  id="search"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Separator className="my-3" />
            <div>
              <Label>Price Range</Label>
              <div className="mt-2 flex h-16 w-full items-end gap-px">
                {scaledHistogramData.map((percentage, index) => (
                  <div
                    key={`histogram-bin-${index}`}
                    className="flex-1 rounded-t-[3px] bg-border"
                    style={{ height: `${percentage}%` }}
                  />
                ))}
              </div>
              <Slider
                minStepsBetweenThumbs={2}
                max={STEP_MAX}
                min={STEP_MIN}
                step={10}
                onValueChange={(values: [number, number]) =>
                  setPriceRange(values)
                }
                className="w-full"
                value={[priceRange[0] ?? STEP_MIN, priceRange[1] ?? STEP_MAX]}
              />
              <div className="mt-3 flex w-full items-center justify-between gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 mt-px inline-flex items-center text-sm font-medium leading-10 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    value={priceRange[0] ?? ""}
                    placeholder={STEP_MIN.toString()}
                    min={STEP_MIN}
                    onChange={(e) => {
                      const inputVal = e.target.value;
                      let newVal: number | undefined;
                      if (inputVal !== "" && !isNaN(Number(inputVal))) {
                        newVal = Number(inputVal);
                      }
                      setPriceRange([newVal, priceRange[1]]);
                    }}
                    onBlur={(e) => {
                      const inputVal = e.target.value;
                      if (inputVal === "") return;
                      const newValue = +inputVal;
                      if (newValue < STEP_MIN) {
                        setPriceRange([STEP_MIN, priceRange[1]]);
                      }
                      if (newValue >= (priceRange?.[1] ?? PRICE_MAX)) {
                        setPriceRange([
                          Math.max((priceRange?.[1] ?? PRICE_MAX) - 20, 0),
                          priceRange[1],
                        ]);
                      }
                    }}
                    className="h-8 w-28 pl-6"
                  />
                </div>

                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 mt-px inline-flex items-center text-sm font-medium leading-10 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    value={priceRange[1] ?? ""}
                    placeholder={STEP_MAX.toString()}
                    onChange={(e) => {
                      const inputVal = e.target.value;
                      let newVal: number | undefined;
                      if (inputVal !== "" && !isNaN(+inputVal)) {
                        newVal = +inputVal;
                      }
                      setPriceRange([priceRange[0], newVal]);
                    }}
                    onBlur={(e) => {
                      const inputVal = e.target.value;
                      if (inputVal === "") return;
                      if (+inputVal < STEP_MIN) {
                        setPriceRange([priceRange[0], STEP_MIN]);
                      }
                      if (+inputVal > PRICE_MAX) {
                        setPriceRange([priceRange[0], PRICE_MAX]);
                      }
                    }}
                    className="h-8 w-28 pl-6"
                  />
                </div>
              </div>
            </div>
            <Separator className="my-3" />
            <div className="flex flex-col space-y-2">
              <Label htmlFor="region">Region</Label>
              <ComboBox
                items={regionData.map((r) => {
                  return { label: r, value: r };
                })}
                value={region}
                onChange={setRegion}
                allowedNoValue={true}
              />
            </div>

            <Separator className="my-3" />
            <div className="flex place-items-center gap-2">
              <Checkbox
                id="onlyAvailable"
                checked={onlyAvailable}
                onCheckedChange={(e) => {
                  if (e !== "indeterminate") {
                    setOnlyAvailable(e);
                  }
                }}
              />
              <Label htmlFor="onlyAvailable">Only Available</Label>
            </div>
            <div className="flex place-items-center gap-2">
              <Checkbox
                id="onlyDedicated"
                checked={onlyDedicated}
                onCheckedChange={(e) => {
                  if (e !== "indeterminate") {
                    setOnlyDedicated(e);
                  }
                }}
              />
              <Label htmlFor="onlyDedicated">Dedicated Hardware Only</Label>
            </div>
          </div>
          <ScrollArea className="h-[40rem] w-full flex-1 pr-3" type="auto">
            <ul className="mt-8 flex flex-col gap-2 text-black">
              {products.length === 0 ? (
                <li className="my-12 grid place-content-center text-xl font-bold">
                  No results found.
                </li>
              ) : (
                products
              )}
            </ul>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onSelect,
}: {
  product: {
    [location: string]: HardwareProduct & {
      summary: string;
    };
  };
  onSelect: (product: HardwareProduct) => void;
}) {
  const locations = useMemo(() => Object.keys(product), [product]);
  const [location, setLocation] = useState<string | undefined>(locations.at(0));
  const selectedProduct = useMemo(
    () => (location ? product[location] : undefined),
    [product, location]
  );

  useEffect(() => {
    setLocation(locations.at(0));
  }, [locations]);

  return (
    <li className="flex flex-col gap-4 rounded border px-6 py-4">
      <div className="grid grid-cols-8 max-xl:grid-cols-4 items-center gap-12">
        <div className="col-span-3 max-xl:col-span-4 flex items-center gap-4">
          <Image
            src={`/images/providers/${selectedProduct?.providerName.toLowerCase()}.svg`}
            alt={selectedProduct?.providerName + " logo"}
            width={48}
            height={48}
            className="text-xs"
          />
          <div className="flex flex-col">
            <span className="font-bold">{selectedProduct?.productName}</span>
            <span className="text-sm text-muted-foreground">
              {selectedProduct?.summary}
            </span>
          </div>
        </div>
        <div className="col-span-2 max-md:col-span-4 flex flex-col gap-0.5 place-items-center">
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <ComboBox
              items={locations.map((l) => {
                return { label: l, value: l };
              })}
              value={location}
              onChange={setLocation}
            />
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Server className="size-3.5" />
            <span className="text-sm">{selectedProduct?.providerName}</span>
          </div>
        </div>
        <div className="max-lg:col-span-2 max-md:col-span-4">
          <span className="flex flex-col place-items-center">
            <span>
              ~
              <span className={"text-xl font-bold"}>
                {formatPrice(selectedProduct?.price.monthly ?? 0)}
              </span>
              /mo
            </span>
            {selectedProduct?.price.hourly !== undefined && (
              <span>
                (
                <span className="font-bold">
                  {formatPrice(selectedProduct.price.hourly)}
                </span>
                /hr)
              </span>
            )}
          </span>
        </div>
        <div className="col-span-2 max-xl:col-span-1 max-lg:col-span-4 flex flex-1 justify-center">
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              className="min-w-48"
              onClick={() => {
                if (!selectedProduct) {
                  return;
                }

                onSelect({
                  ...selectedProduct,
                  location: location ?? selectedProduct.location,
                });
              }}
              disabled={!selectedProduct || selectedProduct.available === 0}
            >
              Select
            </Button>
            {selectedProduct?.available === 0 && (
              <span className="text-sm text-muted-foreground">Unavailable</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function formatPrice(price: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(+price);
}
