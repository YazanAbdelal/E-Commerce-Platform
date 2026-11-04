import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller.js";
import { ProductCatalogClient } from "../clients/product-catalog.client.js";

@Module({
    controllers: [ProductsController],
    providers: [ProductCatalogClient],
})
export class ProductsModule { }
